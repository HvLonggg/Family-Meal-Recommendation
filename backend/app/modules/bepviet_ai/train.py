"""Huấn luyện + đánh giá + cổng chấm điểm cho Bếp Việt AI.

    python -m app.modules.bepviet_ai.train [--data DIR] [--out DIR] [--folds 5] [--tune]

- Cross-validation k-fold trên TRAIN, chia theo NHÓM câu gốc (các biến thể bỏ dấu/viết tắt/
  từ đệm/đổi tên món của cùng một câu nằm chung một fold) để điểm CV không bị thổi phồng; dùng
  để đo, học nhiệt độ hiệu chỉnh và (với `--tune`) chọn siêu tham số. Tập test không bao giờ
  được dùng để chọn tham số.
- Mô hình cuối huấn luyện trên toàn bộ train, chấm trên `utterances_test.jsonl` (dùng cho cổng)
  và `utterances_test2.jsonl` (tập mù: chỉ báo điểm cuối, không dùng cho quyết định nào).
- Cổng tính theo NHÓM định tuyến (intent cùng bộ xử lý gộp làm một, xem `route_group`).
- Ghi `intent_model.bin.gz`, `model_card.json`, `gate.json` (+ `tuning.json` khi `--tune`).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import tracemalloc
from collections import Counter, defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.modules.bepviet_ai import dataset as dataset_module
from app.modules.bepviet_ai.catalog import SNAPSHOT
from app.modules.bepviet_ai.dataset import Utterance
from app.modules.bepviet_ai.gate import (
    BASELINE_FILE,
    GATE_FILE,
    SCENARIO_FILE,
    GateRules,
    Outcome,
    read_json,
    write_json,
)
from app.modules.bepviet_ai.gate import decide as gate_decide
from app.modules.bepviet_ai.model import (
    MODEL_DIR,
    MODEL_FILE,
    IntentModel,
    TrainConfig,
    Vector,
    fit_temperature,
    softmax,
    train,
)
from app.modules.bepviet_ai.responder import groups_for
from app.modules.bepviet_ai.settings import current as ai_settings
from app.modules.bepviet_ai.text import FeatureConfig, featurize, normalize, strip_accents

MODEL_VERSION = "1.1"
CARD_FILE = "model_card.json"
TUNING_FILE = "tuning.json"


# ---------------------------------------------------------------------------
# Chỉ số.
# ---------------------------------------------------------------------------
def classification_report(gold: Sequence[str], predicted: Sequence[str]) -> dict[str, Any]:
    labels = sorted(set(gold) | set(predicted))
    per: dict[str, dict[str, float]] = {}
    for label in labels:
        tp = sum(g == label and p == label for g, p in zip(gold, predicted, strict=True))
        fp = sum(g != label and p == label for g, p in zip(gold, predicted, strict=True))
        fn = sum(g == label and p != label for g, p in zip(gold, predicted, strict=True))
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per[label] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "support": tp + fn,
        }
    supported = [row for row in per.values() if row["support"]]
    accuracy = sum(g == p for g, p in zip(gold, predicted, strict=True)) / max(1, len(gold))
    macro = sum(row["f1"] for row in supported) / max(1, len(supported))
    return {"accuracy": round(accuracy, 4), "macro_f1": round(macro, 4), "per_intent": per}


def confusions(gold: Sequence[str], predicted: Sequence[str], top: int = 15) -> list[list[Any]]:
    """Confusion matrix gọn: chỉ các cặp nhầm (thật → đoán) nhiều nhất."""
    pairs = Counter((g, p) for g, p in zip(gold, predicted, strict=True) if g != p)
    return [[g, p, count] for (g, p), count in pairs.most_common(top)]


# ---------------------------------------------------------------------------
# Chia fold theo nhóm câu gốc.
# ---------------------------------------------------------------------------
# Từ đệm mà bộ sinh dữ liệu thêm vào đầu/cuối câu (xem data/build_dataset.py).
_FILLER_TEXT = (
    "chu rong oi ad cho minh hoi ban xiu nhe voi a nha vay di giup ta ha duoc khong "
    "hey quick question chef dragon hi please thanks pls"
)
_FILLER = frozenset(_FILLER_TEXT.split())


def _dish_names() -> list[str]:
    try:
        rows = json.loads(SNAPSHOT.read_text(encoding="utf-8"))["data"]
    except (OSError, ValueError, KeyError, TypeError):
        return []
    names = {strip_accents(str(row.get("name") or "")) for row in rows}
    return sorted((name for name in names if name), key=len, reverse=True)


def seed_key(text: str, dishes: Sequence[str]) -> str:
    """Khóa gom các biến thể của cùng một câu gốc: bỏ dấu, mở viết tắt, thay tên món/số."""
    plain = f" {normalize(text)[1]} "
    for name in dishes:
        if f" {name} " in plain:
            plain = plain.replace(f" {name} ", " DISH ")
    words = ["N" if word.isdigit() else word for word in plain.split() if word not in _FILLER]
    return " ".join(words)


def grouped_folds(
    labels: Sequence[str], keys: Sequence[str], folds: int, seed: int = 7
) -> list[list[int]]:
    """Stratified group k-fold: cả nhóm vào cùng fold, rải đều theo nhãn."""
    members: dict[tuple[str, str], list[int]] = defaultdict(list)
    for index, (label, key) in enumerate(zip(labels, keys, strict=True)):
        members[(label, key)].append(index)
    by_label: dict[str, list[list[int]]] = defaultdict(list)
    for (label, _key), indices in sorted(members.items()):
        by_label[label].append(indices)
    buckets: list[list[int]] = [[] for _ in range(folds)]
    offset = seed
    for label in sorted(by_label):
        groups = sorted(by_label[label], key=len, reverse=True)
        for position, indices in enumerate(groups):
            buckets[(position + offset) % folds].extend(indices)
        offset += 1
    return [sorted(bucket) for bucket in buckets if bucket]


# ---------------------------------------------------------------------------
# Huấn luyện + đánh giá.
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class Result:
    model: IntentModel
    card: dict[str, Any]
    gate: dict[str, Any]
    errors: list[dict[str, Any]]


@dataclass(slots=True)
class CvResult:
    report: dict[str, Any]
    temperature: float
    routed: dict[str, float]
    group_accuracy: float


def _cross_validate(
    vectors: list[Vector],
    labels: list[str],
    keys: list[str],
    classes: list[str],
    folds: int,
    config: TrainConfig,
    groups: Mapping[str, str],
    threshold: float,
) -> CvResult:
    k = max(2, min(folds, min(Counter(labels).values())))
    oof: list[list[float]] = [[] for _ in labels]
    for bucket in grouped_folds(labels, keys, k):
        held = set(bucket)
        train_idx = [index for index in range(len(labels)) if index not in held]
        fold_model = train(
            [],
            [labels[index] for index in train_idx],
            classes=classes,
            config=config,
            vectors=[vectors[index] for index in train_idx],
        )
        for index in bucket:
            oof[index] = fold_model.scores(vectors[index])[0]
    position = {name: index for index, name in enumerate(classes)}
    temperature = fit_temperature(oof, [position[label] for label in labels])
    predicted = [classes[max(range(len(row)), key=row.__getitem__)] for row in oof]
    report = classification_report(labels, predicted)
    report["folds"] = k
    # Định tuyến theo nhóm trên dự đoán out-of-fold (bỏ qua OOD theo độ phủ vì vector đã có).
    probe = IntentModel.from_rows(classes, {})
    probe.temperature = temperature
    kept = correct = group_hits = 0
    for row, label in zip(oof, labels, strict=True):
        prediction = probe.decide(softmax(row, temperature), 1.0, groups=groups)
        gold = groups.get(label, label)
        group_hits += prediction.group == gold
        if not prediction.ood and prediction.confidence >= threshold:
            kept += 1
            correct += prediction.group == gold
    routed = {
        "coverage": round(kept / len(labels), 4),
        "accuracy_on_kept": round(correct / kept, 4) if kept else 0.0,
    }
    return CvResult(report, temperature, routed, round(group_hits / len(labels), 4))


def _evaluate(
    model: IntentModel,
    rows: Sequence[Utterance],
    groups: Mapping[str, str],
    threshold: float,
) -> tuple[dict[str, Any], list[Outcome], list[dict[str, Any]]]:
    """Điểm theo intent (thô) + theo nhóm định tuyến (thứ cổng thực sự dùng)."""
    if not rows:
        return {}, [], []
    gold: list[str] = []
    predicted: list[str] = []
    outcomes: list[Outcome] = []
    errors: list[dict[str, Any]] = []
    for row in rows:
        prediction = model.predict(row.text, groups=groups)
        gold.append(row.intent)
        predicted.append(prediction.intent)
        outcomes.append(
            Outcome(
                groups.get(row.intent, row.intent),
                prediction.group,
                prediction.confidence,
                prediction.ood,
            )
        )
        if prediction.group != groups.get(row.intent, row.intent):
            errors.append(
                {
                    "text": row.text,
                    "gold": row.intent,
                    "predicted": prediction.intent,
                    "confidence": round(prediction.confidence, 3),
                }
            )
    errors.sort(key=lambda item: -float(item["confidence"]))
    report = classification_report(gold, predicted)
    kept = [item for item in outcomes if not item.ood and item.confidence >= threshold]
    report["group_accuracy"] = round(
        sum(item.gold == item.predicted for item in outcomes) / len(outcomes), 4
    )
    report["routed"] = {
        "threshold": threshold,
        "coverage": round(len(kept) / len(outcomes), 4),
        "accuracy_on_kept": round(sum(i.gold == i.predicted for i in kept) / len(kept), 4)
        if kept
        else 0.0,
    }
    report["confusions"] = confusions(gold, predicted)
    return report, outcomes, errors


def _by_group(table: Mapping[str, Any] | None, groups: Mapping[str, str]) -> dict[str, Any] | None:
    """Điểm tình huống theo intent → theo nhóm định tuyến."""
    if not table:
        return None
    merged: dict[str, dict[str, int]] = defaultdict(lambda: {"passed": 0, "total": 0})
    for intent, row in table.items():
        group = groups.get(intent, intent)
        merged[group]["passed"] += int(row.get("passed", 0))
        merged[group]["total"] += int(row.get("total", 0))
    return dict(merged)


def _performance(model: IntentModel, directory: Path, texts: Sequence[str]) -> dict[str, Any]:
    path = directory / MODEL_FILE
    tracemalloc.start()
    started = time.perf_counter()
    loaded = IntentModel.load(directory)
    load_ms = (time.perf_counter() - started) * 1000
    retained, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    sample = list(texts)[:300] or ["mình muốn nấu phở bò"]
    timings: list[float] = []
    for text in sample:
        started = time.perf_counter()
        loaded.predict(text)
        timings.append((time.perf_counter() - started) * 1000)
    timings.sort()
    return {
        "file_bytes": path.stat().st_size,
        "weights": model.nnz,
        "features": model.n_features,
        "load_ms": round(load_ms, 1),
        "load_peak_mb": round(peak / 1_048_576, 2),
        "resident_mb": round(retained / 1_048_576, 2),
        "infer_ms_mean": round(sum(timings) / len(timings), 3),
        "infer_ms_p95": round(timings[max(0, int(len(timings) * 0.95) - 1)], 3),
    }


def _config_dict(config: TrainConfig) -> dict[str, Any]:
    return {
        "epochs": config.epochs,
        "learning_rate": config.learning_rate,
        "margin": config.margin,
        "seed": config.seed,
        "balanced": config.balanced,
        "features": config.features.as_dict(),
    }


def config_from(data: Mapping[str, Any] | None) -> TrainConfig:
    data = data or {}
    base = TrainConfig()
    return TrainConfig(
        epochs=int(data.get("epochs", base.epochs)),
        learning_rate=float(data.get("learning_rate", base.learning_rate)),
        margin=float(data.get("margin", base.margin)),
        seed=int(data.get("seed", base.seed)),
        balanced=bool(data.get("balanced", base.balanced)),
        features=FeatureConfig.from_dict(data.get("features")),
    )


@dataclass(slots=True)
class Prepared:
    data: dataset_module.Dataset
    train_rows: list[Utterance]
    labels: list[str]
    keys: list[str]
    classes: list[str]
    groups: dict[str, str]
    kinds: dict[str, str]


def prepare(data_dir: Path | None) -> Prepared:
    data = dataset_module.load(data_dir)
    if not data.available:
        raise SystemExit(f"Không có dữ liệu huấn luyện trong {data.directory}.")
    declared = set(data.intents)
    train_rows = [row for row in data.train if not declared or row.intent in declared]
    labels = [row.intent for row in train_rows]
    classes = sorted(set(labels))
    specs = {name: spec for name, spec in data.intents.items() if name in classes}
    groups = {name: groups_for(specs).get(name, name) for name in classes}
    kinds: dict[str, str] = {}
    for name in classes:
        spec = specs.get(name)
        kinds.setdefault(groups[name], spec.kind if spec else dataset_module.HANDOFF)
    dishes = _dish_names()
    keys = [seed_key(row.text, dishes) for row in train_rows]
    return Prepared(data, train_rows, labels, keys, classes, groups, kinds)


def run(
    data_dir: Path | None = None,
    out_dir: Path = MODEL_DIR,
    *,
    folds: int = 5,
    config: TrainConfig | None = None,
    rules: GateRules | None = None,
    measure: bool = True,
) -> Result:
    # Không truyền config: dùng siêu tham số đã chọn bằng --tune (nếu có), không thì mặc định.
    if config is None:
        config = config_from((read_json(out_dir / TUNING_FILE) or {}).get("best"))
    rules = rules or GateRules()
    prep = prepare(data_dir)
    data = prep.data
    declared = set(data.intents)
    test_rows = [row for row in data.test if not declared or row.intent in declared]
    test2_rows = [row for row in data.test2 if not declared or row.intent in declared]
    vectors = [featurize(row.text, config.features) for row in prep.train_rows]

    cv = _cross_validate(
        vectors,
        prep.labels,
        prep.keys,
        prep.classes,
        folds,
        config,
        prep.groups,
        rules.min_confidence,
    )
    model = train([], prep.labels, classes=prep.classes, config=config, vectors=vectors)
    model.temperature = cv.temperature

    test_report, outcomes, errors = _evaluate(model, test_rows, prep.groups, rules.min_confidence)
    test2_report, outcomes2, _ = _evaluate(model, test2_rows, prep.groups, rules.min_confidence)
    gate = gate_decide(
        outcomes,
        prep.kinds,
        rules,
        llm_baseline=_by_group(read_json(out_dir / BASELINE_FILE), prep.groups),
        inhouse_scenarios=_by_group(read_json(out_dir / SCENARIO_FILE), prep.groups),
    )
    if outcomes2:
        # Chỉ để báo cáo: các nhóm đã qua cổng (theo test) giữ precision thế nào trên tập mù.
        blind = gate_decide(outcomes2, prep.kinds, replace(rules, min_support=1))
        gate["blind_check"] = {
            name: {key: blind["intents"][name][key] for key in ("precision", "recall", "answered")}
            for name in gate["passed"]
            if name in blind["intents"]
        }
    model.meta = {
        "version": MODEL_VERSION,
        "data_hash": data.data_hash,
        "groups": prep.groups,
        "intents": {
            name: dataset_module.spec_to_dict(data.intents[name])
            for name in prep.classes
            if name in data.intents
        },
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save(out_dir)
    card: dict[str, Any] = {
        "name": "bepviet-intent",
        "version": MODEL_VERSION,
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "algorithm": "multiclass linear SVM (Crammer-Singer hinge, averaged SGD), hashed char "
        "+ word n-grams (accented + unaccented), softmax temperature calibration, confidence "
        "aggregated per routing group (intents sharing an action handler)",
        "data_dir": data.directory.name if data.directory.name != "bepviet_ai" else "fixtures",
        "data_hash": data.data_hash,
        "train_samples": len(prep.train_rows),
        "train_seed_groups": len(set(zip(prep.labels, prep.keys, strict=True))),
        "test_samples": len(test_rows),
        "test2_samples": len(test2_rows),
        "intents": len(prep.classes),
        "routing_groups": len(set(prep.groups.values())),
        "label_counts": dict(sorted(Counter(prep.labels).items())),
        "config": _config_dict(config),
        "temperature": round(cv.temperature, 4),
        "ood": model.header()["ood"],
        "cross_validation": {
            **cv.report,
            "split": "stratified group k-fold by seed sentence (train only)",
            "group_accuracy": cv.group_accuracy,
            "routed": cv.routed,
        },
        "test": test_report,
        "test2": test2_report,
        "gate_passed": gate["passed"],
    }
    if measure:
        card["performance"] = _performance(
            model, out_dir, [row.text for row in test_rows or prep.train_rows]
        )
    write_json(out_dir / CARD_FILE, card)
    write_json(out_dir / GATE_FILE, gate)
    return Result(model=model, card=card, gate=gate, errors=errors)


# ---------------------------------------------------------------------------
# Chọn siêu tham số bằng CV trên TRAIN (không bao giờ nhìn tập test).
# ---------------------------------------------------------------------------
def _candidates(base: TrainConfig) -> list[tuple[str, str, TrainConfig]]:
    features = base.features
    return [
        ("base", "base", base),
        ("epochs", "epochs=10", replace(base, epochs=10)),
        ("epochs", "epochs=5", replace(base, epochs=5)),
        ("margin", "margin=0.5", replace(base, margin=0.5)),
        ("margin", "margin=2", replace(base, margin=2.0)),
        ("char", "char=3-5", replace(base, features=replace(features, char_low=3))),
        ("char", "char=2-4", replace(base, features=replace(features, char_high=4))),
        ("word", "word=1-3", replace(base, features=replace(features, word_n=3))),
        ("word_weight", "word_weight=2", replace(base, features=replace(features, word_weight=2))),
        ("word_weight", "word_weight=3", replace(base, features=replace(features, word_weight=3))),
        ("balanced", "balanced", replace(base, balanced=True)),
    ]


def tune(
    data_dir: Path | None = None,
    out_dir: Path = MODEL_DIR,
    *,
    folds: int = 3,
    threshold: float = 0.8,
    log: Any = print,
) -> dict[str, Any]:
    prep = prepare(data_dir)
    cache: dict[FeatureConfig, list[Vector]] = {}

    def score(config: TrainConfig) -> dict[str, Any]:
        if config.features not in cache:
            cache[config.features] = [
                featurize(row.text, config.features) for row in prep.train_rows
            ]
        started = time.perf_counter()
        cv = _cross_validate(
            cache[config.features],
            prep.labels,
            prep.keys,
            prep.classes,
            folds,
            config,
            prep.groups,
            threshold,
        )
        return {
            "macro_f1": cv.report["macro_f1"],
            "accuracy": cv.report["accuracy"],
            "group_accuracy": cv.group_accuracy,
            "routed": cv.routed,
            "seconds": round(time.perf_counter() - started, 1),
        }

    rows: list[dict[str, Any]] = []
    best_per_dim: dict[str, tuple[float, TrainConfig]] = {}
    base_score = 0.0
    for dimension, label, config in _candidates(TrainConfig()):
        result = {"name": label, **score(config), "config": _config_dict(config)}
        rows.append(result)
        log(
            f"  {label:16} macro-F1={result['macro_f1']:.4f} acc={result['accuracy']:.4f} "
            f"nhóm={result['group_accuracy']:.4f} giữ={result['routed']['coverage']:.0%} "
            f"đúng={result['routed']['accuracy_on_kept']:.1%} ({result['seconds']}s)"
        )
        if dimension == "base":
            base_score = result["macro_f1"]
        elif result["macro_f1"] > best_per_dim.get(dimension, (base_score, config))[0]:
            best_per_dim[dimension] = (result["macro_f1"], config)
    if len(best_per_dim) >= 2:
        # Ghép các thay đổi có lợi của từng chiều thành một cấu hình rồi chấm lại.
        combined = TrainConfig()
        features = combined.features
        for config in (value for _, value in best_per_dim.values()):
            combined = replace(
                combined,
                epochs=config.epochs if config.epochs != 20 else combined.epochs,
                margin=config.margin if config.margin != 1.0 else combined.margin,
                balanced=config.balanced or combined.balanced,
            )
            default = FeatureConfig()
            features = FeatureConfig(
                char_low=config.features.char_low
                if config.features.char_low != default.char_low
                else features.char_low,
                char_high=config.features.char_high
                if config.features.char_high != default.char_high
                else features.char_high,
                word_n=config.features.word_n
                if config.features.word_n != default.word_n
                else features.word_n,
                word_weight=config.features.word_weight
                if config.features.word_weight != default.word_weight
                else features.word_weight,
            )
        combined = replace(combined, features=features)
        result = {"name": "combined", **score(combined), "config": _config_dict(combined)}
        rows.append(result)
        log(
            f"  {'combined':16} macro-F1={result['macro_f1']:.4f} acc={result['accuracy']:.4f} "
            f"nhóm={result['group_accuracy']:.4f} ({result['seconds']}s)"
        )
    best = max(rows, key=lambda row: (row["macro_f1"], row["group_accuracy"]))
    summary = {
        "selected_by": f"grouped {folds}-fold CV macro-F1 on train only",
        "data_hash": prep.data.data_hash,
        "best": best["config"],
        "best_name": best["name"],
        "results": rows,
    }
    write_json(out_dir / TUNING_FILE, summary)
    return summary


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------
def _print_report(label: str, report: Mapping[str, Any]) -> None:
    routed = report["routed"]
    print(
        f"{label}: accuracy={report['accuracy']} macro-F1={report['macro_f1']} "
        f"(theo nhóm định tuyến {report['group_accuracy']}); ngưỡng {routed['threshold']}: "
        f"giữ lại {routed['coverage']:.0%}, đúng {routed['accuracy_on_kept']:.1%}"
    )


def _print(result: Result) -> None:
    card = result.card
    cv, test = card["cross_validation"], card.get("test") or {}
    print(f"Dữ liệu: {card['data_dir']} ({card['data_hash']}) — {card['intents']} intent")
    print(
        f"Train {card['train_samples']} câu ({card['train_seed_groups']} nhóm câu gốc) · "
        f"test {card['test_samples']} · test2 (mù) {card['test2_samples']}"
    )
    print(f"Cấu hình: {card['config']}")
    print(
        f"CV {cv['folds']}-fold theo nhóm: accuracy={cv['accuracy']} macro-F1={cv['macro_f1']} "
        f"(nhóm định tuyến {cv['group_accuracy']})"
    )
    if test:
        _print_report("Test", test)
    if card.get("test2"):
        _print_report("Test2 (mù)", card["test2"])
    if test:
        print("\nIntent                          P      R      F1   n")
        for name, row in test["per_intent"].items():
            print(
                f"{name[:30]:30} {row['precision']:.2f}  {row['recall']:.2f}  "
                f"{row['f1']:.2f}  {row['support']}"
            )
        print("\nNhầm nhiều nhất trên test (thật → đoán, số câu):")
        for gold, predicted, count in test["confusions"][:10]:
            print(f"  {gold} → {predicted}: {count}")
    if result.errors:
        print("\nLỗi điển hình (sai nhóm, tự tin nhất):")
        for item in result.errors[:8]:
            print(
                f"  [{item['confidence']}] {item['text']!r}: {item['gold']} → {item['predicted']}"
            )
    print(f"\nQua cổng ({len(result.gate['passed'])}): {', '.join(result.gate['passed']) or '—'}")
    for name, row in (result.gate.get("blind_check") or {}).items():
        print(f"  test2 {name}: P={row['precision']} R={row['recall']} n={row['answered']}")
    if "performance" in card:
        perf = card["performance"]
        print(
            f"Mô hình: {perf['file_bytes'] / 1024:.0f} KB nén, {perf['weights']} trọng số; "
            f"tải {perf['load_ms']} ms, RAM ~{perf['resident_mb']} MB "
            f"(đỉnh {perf['load_peak_mb']} MB); suy luận TB {perf['infer_ms_mean']} ms, "
            f"p95 {perf['infer_ms_p95']} ms"
        )


def main(argv: Sequence[str] | None = None) -> None:
    settings = ai_settings()
    parser = argparse.ArgumentParser(description="Huấn luyện Bếp Việt AI")
    parser.add_argument("--data", type=Path, default=None, help="Thư mục dữ liệu")
    parser.add_argument("--out", type=Path, default=MODEL_DIR, help="Thư mục ghi mô hình")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--tune", action="store_true", help="Chọn siêu tham số bằng CV train")
    parser.add_argument("--tune-folds", type=int, default=3)
    parser.add_argument("--min-confidence", type=float, default=settings.min_confidence)
    parser.add_argument("--min-precision", type=float, default=settings.min_precision)
    parser.add_argument("--min-support", type=int, default=GateRules().min_support)
    args = parser.parse_args(argv)
    if args.tune:
        print("Chọn siêu tham số (CV theo nhóm, chỉ trên train):")
        summary = tune(args.data, args.out, folds=args.tune_folds, threshold=args.min_confidence)
        print(f"→ chọn: {summary['best_name']} {summary['best']}\n")
    result = run(
        args.data,
        args.out,
        folds=args.folds,
        rules=GateRules(
            min_confidence=args.min_confidence,
            min_precision=args.min_precision,
            min_support=args.min_support,
        ),
    )
    _print(result)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    main()
