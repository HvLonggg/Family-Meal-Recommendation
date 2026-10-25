"""Phân loại ý định tuyến tính đa lớp, thuần Python (không numpy/scikit-learn).

Huấn luyện: SVM tuyến tính đa lớp kiểu Crammer–Singer bằng SGD (cập nhật lớp đúng và lớp vi
phạm biên mạnh nhất), lấy trung bình trọng số qua các bước để ổn định — tương đương L2 nhẹ.
Hiệu chỉnh: softmax có nhiệt độ T học trên dự đoán out-of-fold (cross-validation) để điểm số
thành độ tin cậy dùng được. OOD: độ tin cậy thấp, biên nhỏ, hoặc câu có quá ít đặc trưng đã
từng gặp khi huấn luyện → chuyển LLM.
"""

from __future__ import annotations

import gzip
import json
import math
import random
import sys
import threading
import time
from array import array
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.modules.bepviet_ai.text import (
    BIAS,
    DEFAULT_FEATURES,
    HASH_BITS,
    HASH_DIM,
    FeatureConfig,
    featurize,
    hash_feature,
)

FORMAT_VERSION = 2
MODEL_DIR = Path(__file__).resolve().parent / "model"
MODEL_FILE = "intent_model.bin.gz"
MAGIC = b"BVAI"
# Trọng số nhỏ hơn ngưỡng này bị bỏ khi lưu: giảm kích thước mà gần như không đổi dự đoán.
PRUNE = 1e-3

Vector = list[tuple[int, float]]
BIAS_INDEX = hash_feature(BIAS)


@dataclass(frozen=True, slots=True)
class Prediction:
    intent: str
    confidence: float
    margin: float
    coverage: float
    ranking: tuple[tuple[str, float], ...]
    ood: bool
    reason: str = ""
    # Nhóm định tuyến: các intent cùng bộ xử lý (vd ingredients + scale_servings) cộng dồn xác
    # suất, vì nhầm giữa chúng không đổi câu trả lời. Không truyền nhóm → nhóm = intent.
    group: str = ""


@dataclass(slots=True)
class OodConfig:
    min_confidence: float = 0.55
    min_margin: float = 0.15
    # Tỷ lệ đặc trưng của câu từng xuất hiện khi huấn luyện; chuỗi vô nghĩa thường rất thấp.
    min_coverage: float = 0.3


def _native(values: array[Any]) -> array[Any]:
    # Tệp luôn little-endian; máy big-endian thì đảo byte.
    if sys.byteorder == "big":
        values.byteswap()
    return values


@dataclass(slots=True)
class IntentModel:
    """Trọng số lưu dạng CSR trên mảng `array` (float32): vài MB RAM thay vì hàng chục MB."""

    classes: list[str]
    # indptr[f]..indptr[f+1] là khoảng của đặc trưng f trong `labels`/`weights`.
    indptr: array[int]
    labels: array[int]
    weights: array[float]
    temperature: float = 1.0
    ood: OodConfig = field(default_factory=OodConfig)
    meta: dict[str, Any] = field(default_factory=dict)
    features: FeatureConfig = DEFAULT_FEATURES

    @classmethod
    def from_rows(cls, classes: list[str], rows: dict[int, list[tuple[int, float]]]) -> IntentModel:
        indptr = array("I", bytes(4 * (HASH_DIM + 1)))
        labels: array[int] = array("H")
        weights: array[float] = array("f")
        for index in range(HASH_DIM):
            for label, weight in rows.get(index, ()):
                labels.append(label)
                weights.append(weight)
            indptr[index + 1] = len(labels)
        return cls(classes=classes, indptr=indptr, labels=labels, weights=weights)

    @property
    def nnz(self) -> int:
        return len(self.weights)

    @property
    def n_features(self) -> int:
        indptr = self.indptr
        return sum(indptr[i + 1] > indptr[i] for i in range(HASH_DIM))

    # -- suy luận ----------------------------------------------------------
    def scores(self, vector: Vector) -> tuple[list[float], float]:
        scores = [0.0] * len(self.classes)
        indptr, labels, weights = self.indptr, self.labels, self.weights
        known = 0
        seen = 0
        for index, value in vector:
            start, end = indptr[index], indptr[index + 1]
            # Đặc trưng thiên lệch (bias) luôn có nên không tính vào độ phủ.
            if index != BIAS_INDEX:
                seen += 1
                known += end > start
            for position in range(start, end):
                scores[labels[position]] += weights[position] * value
        return scores, known / seen if seen else 0.0

    def probabilities(self, scores: Sequence[float]) -> list[float]:
        return softmax(scores, self.temperature)

    def vectorize(self, text: str) -> Vector:
        return featurize(text, self.features)

    def predict(
        self,
        text: str,
        ood: OodConfig | None = None,
        groups: Mapping[str, str] | None = None,
    ) -> Prediction:
        scores, coverage = self.scores(self.vectorize(text))
        return self.decide(self.probabilities(scores), coverage, ood, groups)

    def decide(
        self,
        probs: Sequence[float],
        coverage: float,
        ood: OodConfig | None = None,
        groups: Mapping[str, str] | None = None,
    ) -> Prediction:
        limits = ood or self.ood
        totals: dict[str, float] = {}
        leader: dict[str, int] = {}
        for index, prob in enumerate(probs):
            name = self.classes[index]
            group = groups.get(name, name) if groups else name
            totals[group] = totals.get(group, 0.0) + prob
            if group not in leader or prob > probs[leader[group]]:
                leader[group] = index
        order = sorted(totals, key=totals.__getitem__, reverse=True)
        best = order[0]
        confidence = totals[best]
        margin = confidence - (totals[order[1]] if len(order) > 1 else 0.0)
        reason = ""
        if coverage < limits.min_coverage:
            reason = "low_coverage"
        elif confidence < limits.min_confidence:
            reason = "low_confidence"
        elif margin < limits.min_margin:
            reason = "small_margin"
        ranked = sorted(range(len(probs)), key=probs.__getitem__, reverse=True)[:3]
        return Prediction(
            intent=self.classes[leader[best]],
            confidence=confidence,
            margin=margin,
            coverage=coverage,
            ranking=tuple((self.classes[i], round(probs[i], 4)) for i in ranked),
            ood=bool(reason),
            reason=reason,
            group=best,
        )

    # -- lưu / tải ---------------------------------------------------------
    def header(self) -> dict[str, Any]:
        return {
            "format": FORMAT_VERSION,
            "hash_bits": HASH_BITS,
            "classes": self.classes,
            "temperature": round(self.temperature, 4),
            "ood": {
                "min_confidence": self.ood.min_confidence,
                "min_margin": self.ood.min_margin,
                "min_coverage": self.ood.min_coverage,
            },
            "nnz": self.nnz,
            "features": self.features.as_dict(),
            "meta": self.meta,
        }

    def to_bytes(self) -> bytes:
        """MAGIC | độ dài header (u32 LE) | header JSON | indptr u32 | labels u16 | w f32."""
        header = json.dumps(self.header(), ensure_ascii=False, separators=(",", ":")).encode()
        parts = [MAGIC, len(header).to_bytes(4, "little"), header]
        for values in (self.indptr, self.labels, self.weights):
            parts.append(_native(array(values.typecode, values)).tobytes())
        # mtime=0: cùng dữ liệu + cùng seed → tệp giống hệt byte (dễ so sánh trong Git).
        return gzip.compress(b"".join(parts), compresslevel=9, mtime=0)

    def save(self, directory: Path = MODEL_DIR) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / MODEL_FILE
        path.write_bytes(self.to_bytes())
        return path

    @classmethod
    def from_bytes(cls, blob: bytes) -> IntentModel:
        raw = gzip.decompress(blob)
        if raw[:4] != MAGIC:
            raise ValueError("Not a Bep Viet AI model file.")
        size = int.from_bytes(raw[4:8], "little")
        data = json.loads(raw[8 : 8 + size])
        if data.get("format") != FORMAT_VERSION or data.get("hash_bits") != HASH_BITS:
            raise ValueError("Incompatible Bep Viet AI model format.")
        nnz = int(data["nnz"])
        offset = 8 + size
        arrays: list[array[Any]] = []
        for typecode, count in (("I", HASH_DIM + 1), ("H", nnz), ("f", nnz)):
            values: array[Any] = array(typecode)
            length = values.itemsize * count
            values.frombytes(raw[offset : offset + length])
            offset += length
            arrays.append(_native(values))
        if len(arrays[0]) != HASH_DIM + 1 or len(arrays[2]) != nnz:
            raise ValueError("Truncated Bep Viet AI model file.")
        ood = data.get("ood") or {}
        return cls(
            classes=[str(name) for name in data["classes"]],
            indptr=arrays[0],
            labels=arrays[1],
            weights=arrays[2],
            temperature=float(data.get("temperature") or 1.0),
            ood=OodConfig(**{key: float(value) for key, value in ood.items()}),
            meta=dict(data.get("meta") or {}),
            features=FeatureConfig.from_dict(data.get("features")),
        )

    @classmethod
    def load(cls, directory: Path = MODEL_DIR) -> IntentModel:
        return cls.from_bytes((directory / MODEL_FILE).read_bytes())


def softmax(scores: Sequence[float], temperature: float = 1.0) -> list[float]:
    if not scores:
        return []
    scaled = [score / max(temperature, 1e-6) for score in scores]
    top = max(scaled)
    exps = [math.exp(value - top) for value in scaled]
    total = sum(exps)
    return [value / total for value in exps]


# ---------------------------------------------------------------------------
# Huấn luyện.
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class TrainConfig:
    epochs: int = 20
    learning_rate: float = 1.0
    margin: float = 1.0
    seed: int = 13
    # Cân bằng lớp: bước cập nhật tỷ lệ nghịch với số câu của lớp đúng.
    balanced: bool = False
    features: FeatureConfig = DEFAULT_FEATURES


def train(
    texts: Sequence[str],
    labels: Sequence[str],
    *,
    classes: Sequence[str] | None = None,
    config: TrainConfig | None = None,
    vectors: Sequence[Vector] | None = None,
) -> IntentModel:
    """SGD hinge đa lớp + trung bình trọng số (averaged perceptron với biên)."""
    config = config or TrainConfig()
    names = list(classes) if classes is not None else sorted(set(labels))
    position = {name: index for index, name in enumerate(names)}
    data = (
        list(vectors)
        if vectors is not None
        else [featurize(text, config.features) for text in texts]
    )
    targets = [position[label] for label in labels]
    counts = [0] * len(names)
    for target in targets:
        counts[target] += 1
    average = len(targets) / max(1, sum(1 for count in counts if count))
    rates = [
        config.learning_rate * (average / count if config.balanced and count else 1.0)
        for count in counts
    ]
    weights: dict[int, dict[int, float]] = {}
    # Tổng có trọng số thời gian để tính trung bình trọng số mà không phải cộng dồn mỗi bước.
    stamped: dict[int, dict[int, float]] = {}
    order = list(range(len(data)))
    rng = random.Random(config.seed)
    step = 1
    for _epoch in range(config.epochs):
        rng.shuffle(order)
        for sample in order:
            vector, target = data[sample], targets[sample]
            scores = [0.0] * len(names)
            for index, value in vector:
                row = weights.get(index)
                if row:
                    for label, weight in row.items():
                        scores[label] += weight * value
            true_score = scores[target]
            scores[target] = -math.inf
            rival = max(range(len(names)), key=scores.__getitem__)
            if len(names) > 1 and true_score - scores[rival] < config.margin:
                rate = rates[target]
                for index, value in vector:
                    row = weights.setdefault(index, {})
                    stamp = stamped.setdefault(index, {})
                    for label, sign in ((target, 1.0), (rival, -1.0)):
                        delta = sign * rate * value
                        row[label] = row.get(label, 0.0) + delta
                        stamp[label] = stamp.get(label, 0.0) + step * delta
            step += 1
    rows: dict[int, list[tuple[int, float]]] = {}
    for index, row in weights.items():
        stamp = stamped[index]
        kept = [
            (label, weight - stamp[label] / step)
            for label, weight in sorted(row.items())
            if abs(weight - stamp[label] / step) >= PRUNE
        ]
        if kept:
            rows[index] = kept
    model = IntentModel.from_rows(names, rows)
    model.features = config.features
    return model


def fit_temperature(scores: Sequence[Sequence[float]], targets: Sequence[int]) -> float:
    """Nhiệt độ T tối thiểu hóa NLL trên dự đoán out-of-fold (tìm lưới log, rồi tinh chỉnh)."""
    if not scores:
        return 1.0

    def nll(temperature: float) -> float:
        total = 0.0
        for row, target in zip(scores, targets, strict=True):
            total -= math.log(max(softmax(row, temperature)[target], 1e-12))
        return total / len(scores)

    grid = [0.02 * (1.25**step) for step in range(30)]
    best = min(grid, key=nll)
    for _ in range(2):
        finer = [best * (0.85 + 0.03 * step) for step in range(11)]
        best = min(finer, key=nll)
    return best


# ---------------------------------------------------------------------------
# Tải lười một lần, an toàn đa luồng.
# ---------------------------------------------------------------------------
class ModelHolder:
    def __init__(self, directory: Path = MODEL_DIR) -> None:
        self.directory = directory
        self._lock = threading.Lock()
        self._model: IntentModel | None = None
        self._loaded = False
        self.load_ms = 0.0
        self.error = ""

    def get(self) -> IntentModel | None:
        if self._loaded:
            return self._model
        with self._lock:
            if not self._loaded:
                started = time.perf_counter()
                try:
                    self._model = IntentModel.load(self.directory)
                    self.error = ""
                except FileNotFoundError:
                    self._model, self.error = None, "missing"
                except Exception as exc:  # Mô hình hỏng: chạy tiếp với LLM, không sập.
                    self._model, self.error = None, type(exc).__name__
                self.load_ms = (time.perf_counter() - started) * 1000
                self._loaded = True
        return self._model

    def reset(self, directory: Path | None = None) -> None:
        with self._lock:
            if directory is not None:
                self.directory = directory
            self._model = None
            self._loaded = False


HOLDER = ModelHolder()
