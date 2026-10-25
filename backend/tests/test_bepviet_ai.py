"""Bếp Việt AI: chuẩn hóa, mô hình, cổng, bộ định tuyến (không gọi Gemini)."""

from __future__ import annotations

import gzip
import random
import time
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.modules.assistant import engine
from app.modules.bepviet_ai import dataset, evaluate, router, train
from app.modules.bepviet_ai import gate as gate_module
from app.modules.bepviet_ai import model as model_module
from app.modules.bepviet_ai import settings as ai_settings
from app.modules.bepviet_ai.catalog import SessionRecipeSource, snapshot_factory
from app.modules.bepviet_ai.gate import GateRules, Outcome
from app.modules.bepviet_ai.model import MODEL_FILE, IntentModel
from app.modules.bepviet_ai.text import FeatureConfig, expand, featurize, normalize

FIXTURES = Path(__file__).parent / "fixtures" / "bepviet_ai"


# ---------------------------------------------------------------------------
# Dữ liệu dùng chung: huấn luyện một lần trên bộ mẫu nhỏ.
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def trained(tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("bepviet_model")
    train.run(FIXTURES, out, folds=3, rules=GateRules(min_support=3), measure=False)
    return out


@pytest.fixture(scope="module")
def source() -> Generator[SessionRecipeSource, None, None]:
    engine.reset_catalog_cache()
    factory = snapshot_factory(FIXTURES / "recipes.json")
    session: Session = factory()
    yield SessionRecipeSource(session)
    session.close()
    engine.reset_catalog_cache()


@pytest.fixture
def use_model(trained: Path) -> Generator[Path, None, None]:
    model_module.HOLDER.reset(trained)
    gate_module.HOLDER.reset(trained)
    router.reset()
    yield trained
    model_module.HOLDER.reset(model_module.MODEL_DIR)
    gate_module.HOLDER.reset(model_module.MODEL_DIR)
    router.reset()


def _context(source: SessionRecipeSource, **kwargs: object) -> router.Context:
    return router.Context(source=source, rng=random.Random(3), **kwargs)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Chuẩn hóa + đặc trưng.
# ---------------------------------------------------------------------------
def test_expand_slang_and_units() -> None:
    assert expand("Mik ko bt nấu, dc ko?") == "mình không bt nấu được không"
    assert normalize("Nấu 10p cho 4ng nha")[1] == "nau 10 phut cho 4 nguoi nha"
    # Câu tiếng Anh giữ nguyên chữ cái đơn.
    assert expand("plan b for the recipe") == "plan b for the recipe"


def test_features_are_stable_and_accent_robust() -> None:
    first, second = featurize("phở bò"), featurize("phở bò")
    assert first == second
    norm = sum(value * value for _, value in first) ** 0.5
    assert norm == pytest.approx(1.0)
    accented = {index for index, _ in featurize("phở bò")}
    plain = {index for index, _ in featurize("pho bo")}
    # Bản không dấu là tập con của bản có dấu → người gõ không dấu vẫn khớp.
    assert plain <= accented


def test_dataset_missing_files_is_soft(tmp_path: Path) -> None:
    data = dataset.load(tmp_path)
    assert not data.available and data.scenarios == []
    with pytest.raises(SystemExit):
        train.run(tmp_path, tmp_path / "out", measure=False)


# ---------------------------------------------------------------------------
# Mô hình.
# ---------------------------------------------------------------------------
def test_training_on_fixture_produces_accurate_model(trained: Path) -> None:
    card = gate_module.read_json(trained / train.CARD_FILE)
    assert card is not None
    assert card["test"]["accuracy"] >= 0.85
    assert card["train_samples"] > 0 and card["data_hash"]
    model = IntentModel.load(trained)
    assert model.predict("nguyên liệu phở bò gồm gì").intent == "recipe_ingredients"
    assert model.predict("canh chua ca nau bao lau").intent == "recipe_time"
    assert model.meta["intents"]["greeting"]["answer_vi"]


def test_model_roundtrip_and_speed(trained: Path) -> None:
    started = time.perf_counter()
    model = IntentModel.load(trained)
    assert time.perf_counter() - started < 1.0
    assert (trained / MODEL_FILE).stat().st_size < 2_000_000
    texts = ["cách nấu gà luộc", "hôm nay ăn gì", "quên mật khẩu"] * 20
    started = time.perf_counter()
    for text in texts:
        model.predict(text)
    assert (time.perf_counter() - started) / len(texts) < 0.02
    again = IntentModel.from_bytes(model.to_bytes())
    assert again.predict("cách nấu gà luộc") == model.predict("cách nấu gà luộc")


def test_training_is_deterministic() -> None:
    texts = ["xin chào", "chào bạn", "cách nấu phở", "nấu phở thế nào"]
    labels = ["greeting", "greeting", "steps", "steps"]
    first = model_module.train(texts, labels).to_bytes()
    second = model_module.train(texts, labels).to_bytes()
    assert first == second


def test_gibberish_is_out_of_distribution(trained: Path) -> None:
    prediction = IntentModel.load(trained).predict("qwzx plmk vbnr")
    assert prediction.ood
    assert prediction.reason in ("low_coverage", "low_confidence", "small_margin")


# ---------------------------------------------------------------------------
# Cổng chấm điểm.
# ---------------------------------------------------------------------------
def test_gate_rules() -> None:
    outcomes = [Outcome("faq_a", "faq_a", 0.97, False) for _ in range(6)]
    outcomes += [Outcome("faq_b", "faq_b", 0.9, False) for _ in range(5)]
    outcomes += [Outcome("faq_c", "faq_b", 0.95, False)]  # faq_b precision 5/6 < 0.95
    outcomes += [Outcome("open", "open", 0.99, False) for _ in range(6)]
    outcomes += [Outcome("faq_c", "faq_c", 0.5, False) for _ in range(6)]  # quá thấp
    kinds = {"faq_a": "faq", "faq_b": "faq", "faq_c": "faq", "open": "handoff_llm"}
    result = gate_module.decide(outcomes, kinds, GateRules(min_confidence=0.8))
    assert result["passed"] == ["faq_a"]
    assert "handoff_intent" in result["intents"]["open"]["reasons"]
    # Có điểm Gemini: mô hình riêng phải ≥ Gemini trên bộ tình huống.
    worse = gate_module.decide(
        outcomes,
        kinds,
        GateRules(min_confidence=0.8),
        llm_baseline={"faq_a": {"passed": 4, "total": 4}},
        inhouse_scenarios={"faq_a": {"passed": 3, "total": 4}},
    )
    assert worse["passed"] == []
    assert "below_llm" in worse["intents"]["faq_a"]["reasons"]


# ---------------------------------------------------------------------------
# Bộ định tuyến.
# ---------------------------------------------------------------------------
def test_router_without_model_falls_back_to_llm(
    tmp_path: Path, source: SessionRecipeSource
) -> None:
    model_module.HOLDER.reset(tmp_path)
    gate_module.HOLDER.reset(tmp_path)
    router.reset()
    try:
        decision = router.decide("cách nấu phở bò", context=_context(source, mode="auto"))
        assert decision.route == "llm" and decision.reason == "no_model"
        (tmp_path / MODEL_FILE).write_bytes(gzip.compress(b"{not json"))
        router.reset()
        broken = router.decide("cách nấu phở bò", context=_context(source, mode="auto"))
        assert broken.route == "llm" and broken.answer is None
    finally:
        model_module.HOLDER.reset(model_module.MODEL_DIR)
        gate_module.HOLDER.reset(model_module.MODEL_DIR)
        router.reset()


def test_modes_off_and_shadow(use_model: Path, source: SessionRecipeSource) -> None:
    off = router.decide("xin chào", context=_context(source, mode="off"))
    assert off.route == "llm" and off.reason == "off"
    shadow = router.decide("quên mật khẩu", context=_context(source, mode="shadow"))
    assert shadow.route == "llm" and shadow.answer is None
    assert shadow.intent == "account_password" and shadow.would_route == "inhouse"


def test_default_mode_is_shadow(
    use_model: Path, source: SessionRecipeSource, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert Settings.model_fields["ai_mode"].default == "shadow"
    monkeypatch.setenv("BEP_VIET_AI_MODE", "auto")
    monkeypatch.setenv("BEP_VIET_AI_MIN_CONFIDENCE", "0.9")
    get_settings.cache_clear()
    assert ai_settings.current() == ai_settings.AiSettings("auto", 0.9, 0.95)
    assert router.decide("quên mật khẩu", context=_context(source)).mode == "auto"
    # Giá trị hỏng: không làm hỏng lượt chat, quay về shadow (vẫn dùng LLM).
    monkeypatch.setenv("BEP_VIET_AI_MODE", "khong-hop-le")
    get_settings.cache_clear()
    decision = router.decide("quên mật khẩu", context=_context(source))
    assert decision.mode == "shadow" and decision.route == "llm"


def test_auto_uses_gate(use_model: Path, source: SessionRecipeSource) -> None:
    decision = router.decide("quên mật khẩu rồi", context=_context(source, mode="auto"))
    assert decision.route == "inhouse" and decision.answer is not None
    assert "Quên mật khẩu" in decision.answer.content
    # Gỡ intent khỏi cổng → cùng câu phải đi LLM.
    gate_path = use_model / gate_module.GATE_FILE
    data = gate_module.read_json(gate_path) or {}
    original = dict(data)
    data["passed"] = [name for name in data["passed"] if name != "account_password"]
    gate_module.write_json(gate_path, data)
    try:
        router.reset()
        blocked = router.decide("quên mật khẩu rồi", context=_context(source, mode="auto"))
        assert blocked.route == "llm" and blocked.reason == "not_gated"
    finally:
        gate_module.write_json(gate_path, original)
        router.reset()


def test_low_confidence_goes_to_llm(use_model: Path, source: SessionRecipeSource) -> None:
    decision = router.decide("qwzx plmk vbnr", context=_context(source, mode="inhouse_only"))
    assert decision.route == "llm" and decision.intent == dataset.HANDOFF
    strict = router.decide(
        "quên mật khẩu", context=_context(source, mode="auto", min_confidence=0.9999)
    )
    assert strict.route == "llm" and strict.reason == "low_confidence"


def test_ingredients_are_scaled_from_real_recipe(
    use_model: Path, source: SessionRecipeSource
) -> None:
    decision = router.decide(
        "nguyên liệu phở bò hà nội cho 2 người", context=_context(source, mode="inhouse_only")
    )
    assert decision.route == "inhouse" and decision.answer is not None
    assert decision.slots["dish"] == "pho-bo-ha-noi" and decision.slots["servings"] == 2
    detail = source.detail("pho-bo-ha-noi")
    assert detail is not None
    bone = next(item for item in detail.ingredients if item.name == "Xương bò")
    assert bone.amount is not None
    assert f"Xương bò: {bone.amount / 2:g} g" in decision.answer.content


def test_cook_time_uses_history_for_dish(use_model: Path, source: SessionRecipeSource) -> None:
    context = _context(
        source, mode="inhouse_only", history=[("user", "cách nấu gà luộc"), ("assistant", "…")]
    )
    decision = router.decide("món đó nấu bao lâu", context=context)
    assert decision.route == "inhouse" and decision.answer is not None
    detail = source.detail("ga-luoc")
    assert detail is not None
    assert f"{detail.total_minutes} phút" in decision.answer.content
    assert decision.slots["dish_from_history"] is True


def test_never_invents_dishes(use_model: Path, source: SessionRecipeSource) -> None:
    unknown = router.decide("cách nấu pizza hải sản", context=_context(source, mode="inhouse_only"))
    assert unknown.route == "llm" and unknown.reason == "unknown_dish"
    # Không có số liệu calo trong kho → không tự ước lượng.
    calories = router.decide(
        "gà luộc bao nhiêu calo", context=_context(source, mode="inhouse_only")
    )
    assert calories.route == "llm" and calories.reason == "missing_data"
    suggest = router.decide("tối nay nấu gì", context=_context(source, mode="inhouse_only"))
    assert suggest.route == "inhouse" and suggest.answer is not None
    slugs = {entry.slug for entry in source.entries()}
    assert suggest.answer.recipes and set(suggest.answer.recipes) <= slugs


def test_missing_dish_asks_back(use_model: Path, source: SessionRecipeSource) -> None:
    vague = router.decide("nguyên liệu gồm những gì", context=_context(source, mode="inhouse_only"))
    assert vague.route == "inhouse" and vague.answer is not None
    assert vague.answer.handler == "ask"
    several = router.decide("canh chua cần gì", context=_context(source, mode="inhouse_only"))
    assert several.answer is not None and "Canh chua tôm" in several.answer.content


def test_scenarios_pass_on_fixture(use_model: Path, source: SessionRecipeSource) -> None:
    data = dataset.load(FIXTURES)
    checks = evaluate.score_inhouse(
        data.scenarios,
        lambda: router.Context(source=source),
        evaluate.kinds_of(data.intents),
        min_confidence=0.8,
    )
    failed = [check for check in checks if not check.passed]
    assert not failed, failed


def test_group_confidence_aggregates_shared_handler() -> None:
    model = IntentModel.from_rows(["ingredients", "scale", "other"], {})
    probs = [0.45, 0.4, 0.15]
    alone = model.decide(probs, 1.0)
    assert alone.intent == "ingredients" and alone.ood  # 0.45 < ngưỡng OOD
    grouped = model.decide(probs, 1.0, groups={"ingredients": "g", "scale": "g"})
    assert grouped.group == "g" and grouped.intent == "ingredients"
    assert grouped.confidence == pytest.approx(0.85) and not grouped.ood


def test_seed_key_groups_generated_variants() -> None:
    dishes = ["pho bo ha noi"]
    first = train.seed_key("Chú Rồng ơi, nguyên liệu Phở bò Hà Nội cho 4 người nhé", dishes)
    second = train.seed_key("nguyen lieu pho bo ha noi cho 2 nguoi", dishes)
    assert first == second == "nguyen lieu DISH N nguoi"
    labels = ["x", "x", "x", "y", "y", "y"]
    keys = ["k1", "k1", "k2", "k3", "k4", "k4"]
    folds = train.grouped_folds(labels, keys, 2)
    for bucket in folds:
        assert ({0, 1} <= set(bucket)) or not ({0, 1} & set(bucket))
        assert ({4, 5} <= set(bucket)) or not ({4, 5} & set(bucket))


def test_feature_config_is_saved_with_model() -> None:
    features = FeatureConfig(char_low=3, char_high=4, word_n=3, word_weight=2.0)
    texts = ["xin chào bạn", "chào nhé", "cách nấu phở bò", "nấu phở thế nào"]
    labels = ["greeting", "greeting", "steps", "steps"]
    model = model_module.train(
        texts, labels, config=model_module.TrainConfig(epochs=5, features=features)
    )
    again = IntentModel.from_bytes(model.to_bytes())
    assert again.features == features
    assert again.predict("cách nấu phở") == model.predict("cách nấu phở")
