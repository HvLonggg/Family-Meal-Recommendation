import zlib
from decimal import Decimal
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.modules.articles.models import Article
from app.modules.assistant import ai, knowledge, rag
from app.modules.assistant.models import AssistantKnowledgeChunk
from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep

RECIPES: list[dict[str, Any]] = [
    {
        "slug": "pho-bo-ha-noi",
        "name": "Phở bò Hà Nội",
        "category": "Món nước",
        "ingredients": [
            ("Xương bò", "1.5", "kg"),
            ("Bánh phở", "500", "g"),
            ("Hoa hồi", "3", "cái"),
        ],
        "steps": [
            ("prep", "Chần xương bò qua nước sôi 5 phút rồi rửa sạch cho nước dùng trong."),
            (
                "cook",
                "Hầm xương với gừng, hành nướng và hoa hồi trong 3 giờ, hớt bọt thường xuyên.",
            ),
        ],
        "tip": "Nướng gừng và hành tím cho thơm trước khi thả vào nồi.",
    },
    {
        "slug": "ga-kho-gung",
        "name": "Gà kho gừng",
        "category": "Món mặn",
        "ingredients": [("Thịt gà", "600", "g"), ("Gừng", "1", "củ"), ("Nước mắm", "2", "thìa")],
        "steps": [
            ("prep", "Ướp gà với nước mắm, đường và gừng thái sợi trong 30 phút."),
            ("cook", "Kho lửa nhỏ 25 phút đến khi nước sánh lại."),
        ],
        "tip": "Thắng chút nước màu để gà lên màu đẹp.",
    },
    {
        "slug": "canh-chua-ca",
        "name": "Canh chua cá lóc",
        "category": "Món canh",
        "ingredients": [("Cá lóc", "500", "g"), ("Me chua", "50", "g"), ("Dứa", "0.25", "quả")],
        "steps": [("cook", "Nấu nước me, thả dứa và cà chua, cho cá vào nấu chín 7 phút.")],
        "tip": "Cho rau ngổ, ngò gai sau cùng để giữ mùi thơm.",
    },
]

ARTICLE_BODY = (
    "Muốn bảo quản rau thơm được lâu, hãy nhặt bỏ lá úa rồi để ráo nước.\n\n"
    "Cuộn rau trong khăn giấy ẩm, cho vào hộp kín và cất ngăn mát tủ lạnh; rau giữ tươi "
    "khoảng một tuần."
)


def seed(factory: sessionmaker[Session]) -> None:
    with factory() as session:
        for item in RECIPES:
            recipe = Recipe(
                slug=item["slug"],
                name=item["name"],
                excerpt=f"{item['name']} chuẩn vị cơm nhà.",
                region="Ba miền",
                category=item["category"],
                difficulty="Dễ",
                prep_minutes=10,
                cook_minutes=30,
                base_servings=4,
                image_path=f"/images/{item['slug']}.jpg",
                image_alt=item["name"],
                serving="Ăn nóng.",
                tip=item["tip"],
                source_name="Bếp Việt",
                source_url="",
                status="published",
                content={"tags": {"meal_type": ["trưa"]}},
                search_text=rag.normalize_search(item["name"]),
            )
            for position, (name, amount, unit) in enumerate(item["ingredients"], start=1):
                recipe.ingredients.append(
                    RecipeIngredient(
                        group_name="Chính",
                        name=name,
                        amount=Decimal(amount),
                        unit=unit,
                        scalable=True,
                        position=position,
                    )
                )
            for position, (step_type, text) in enumerate(item["steps"], start=1):
                recipe.steps.append(
                    RecipeStep(step_type=step_type, content=text, position=position)
                )
            session.add(recipe)
        session.add(
            Article(
                kind="tip",
                slug="bao-quan-rau-thom",
                title="Mẹo bảo quản rau thơm",
                excerpt="Giữ rau thơm tươi cả tuần.",
                body=ARTICLE_BODY,
                category="Mẹo bếp",
                status="published",
            )
        )
        session.add(
            Article(
                kind="story",
                slug="ban-nhap",
                title="Bản nháp bí mật",
                excerpt="Chưa xuất bản.",
                body="Nội dung chưa duyệt về bánh xèo.",
                category="Câu chuyện",
                status="draft",
            )
        )
        session.commit()


def fake_vector(text: str) -> list[float]:
    vector = [0.0] * knowledge.EMBED_DIMENSIONS
    # Bỏ tiền tố nhiệm vụ "title: … | text:" / "task: … | query:" như một model thật.
    body = text.rsplit("| ", 1)[-1].split(": ", 1)[-1]
    for term in rag.tokenize(body):
        vector[zlib.crc32(term.encode()) % knowledge.EMBED_DIMENSIONS] += 1.0
    return vector


@pytest.fixture
def fake_gemini(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def fake_post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append({"url": url, **kwargs})
        texts = [item["content"]["parts"][0]["text"] for item in kwargs["json"]["requests"]]
        return httpx.Response(200, json={"embeddings": [{"values": fake_vector(t)} for t in texts]})

    # Vector giả (đếm từ) cho cosine thấp hơn model thật nhiều: hạ ngưỡng sàn cho phù hợp.
    monkeypatch.setattr(rag, "MIN_DENSE", 0.05)
    monkeypatch.setattr(knowledge, "embedding_model", lambda: "gemini-embedding-2")
    monkeypatch.setattr(knowledge, "_gemini_key", lambda: "<test-key>")
    monkeypatch.setattr(knowledge.httpx, "post", fake_post)
    return calls


def test_split_text_keeps_chunks_under_limit() -> None:
    text = "\n\n".join(["Câu dài vừa phải để thử. " * 8] * 6)
    chunks = knowledge.split_text(text, limit=300)
    assert len(chunks) > 1
    assert all(len(chunk) <= 300 for chunk in chunks)


def test_tokenize_strips_accents_and_adds_bigrams() -> None:
    terms = rag.tokenize("Cách nấu Thịt Bò kho thế nào?")
    assert "thit_bo" in terms and "bo" in terms
    assert "nao" not in terms


def test_sync_is_incremental_and_skips_drafts(
    database_session_factory: sessionmaker[Session],
) -> None:
    seed(database_session_factory)
    with database_session_factory() as session:
        first = knowledge.sync_documents(session)
        assert first.added == first.total and first.removed == 0
        keys = set(session.scalars(select(AssistantKnowledgeChunk.chunk_key)))
        assert "recipe:pho-bo-ha-noi:steps:1" in keys
        assert "article:bao-quan-rau-thom:1" in keys
        assert "guide:planner" in keys
        assert not any(key.startswith("article:ban-nhap") for key in keys)

        again = knowledge.sync_documents(session)
        assert (again.added, again.updated, again.removed) == (0, 0, 0)

        recipe = session.scalars(select(Recipe).where(Recipe.slug == "ga-kho-gung")).one()
        recipe.tip = "Dùng gừng già cho thơm."
        session.delete(session.scalars(select(Recipe).where(Recipe.slug == "canh-chua-ca")).one())
        session.commit()
        changed = knowledge.sync_documents(session)
        assert changed.updated == 1
        assert changed.removed == 3  # tổng quan, nguyên liệu, cách làm của món đã xóa


def test_bm25_retrieval_hits_expected_sources(
    database_session_factory: sessionmaker[Session],
) -> None:
    seed(database_session_factory)
    cases = {
        "Nấu nước dùng phở bò thế nào cho trong?": "pho-bo-ha-noi",
        "ướp gà bao lâu": "ga-kho-gung",
        "Canh chua cá cần nguyên liệu gì": "canh-chua-ca",
        "làm sao giữ rau thơm tươi lâu": "bao-quan-rau-thom",
        "danh sách đi chợ ở đâu": "shopping",
    }
    with database_session_factory() as session:
        knowledge.sync_documents(session)
        hits_at_3 = 0
        for query, expected in cases.items():
            hits = rag.retrieve(session, query, k=3)
            hits_at_3 += expected in [hit.chunk.source_key for hit in hits[:3]]
            assert hits and hits[0].chunk.source_key == expected, (query, hits[:2])
        assert hits_at_3 == len(cases)
        assert rag.retrieve(session, "xyz qwerty", k=3) == []


def test_embeddings_use_gemini_2_prefixes_and_hybrid_search(
    database_session_factory: sessionmaker[Session], fake_gemini: list[dict[str, Any]]
) -> None:
    seed(database_session_factory)
    with database_session_factory() as session:
        report = knowledge.sync_knowledge(session)
        assert report.embedded == report.total
        assert knowledge.pending_embeddings(session) == 0
        request = fake_gemini[0]["json"]["requests"][0]
        assert "taskType" not in request
        assert request["content"]["parts"][0]["text"].startswith("title: ")
        assert request["outputDimensionality"] == 768

        hits = rag.retrieve(session, "hầm xương bò mấy tiếng", k=3)
        assert hits[0].chunk.source_key == "pho-bo-ha-noi"
        assert hits[0].dense > 0 and hits[0].lexical > 0
        query_text = fake_gemini[-1]["json"]["requests"][0]["content"]["parts"][0]["text"]
        assert query_text.startswith("task: search result | query: ")

        # Nội dung đổi thì embedding cũ bị xóa và tạo lại.
        recipe = session.scalars(select(Recipe).where(Recipe.slug == "ga-kho-gung")).one()
        recipe.tip = "Mẹo mới."
        session.commit()
        assert knowledge.sync_knowledge(session).embedded == 1


def test_embedding_failure_falls_back_to_bm25(
    database_session_factory: sessionmaker[Session],
    fake_gemini: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed(database_session_factory)
    with database_session_factory() as session:
        knowledge.sync_knowledge(session)
        monkeypatch.setattr(knowledge.httpx, "post", lambda *_, **__: httpx.Response(429))
        hits = rag.retrieve(session, "ướp gà bao lâu", k=3)
        assert hits[0].chunk.source_key == "ga-kho-gung"
        assert hits[0].dense == 0

        recipe = session.scalars(select(Recipe).where(Recipe.slug == "ga-kho-gung")).one()
        recipe.tip = "Mẹo khác."
        session.commit()
        assert knowledge.sync_knowledge(session).embedded == 0
        assert knowledge.pending_embeddings(session) > 0


def test_extract_citations_maps_numbers_to_sources() -> None:
    hits = [
        rag.Hit(rag.Chunk("a", "recipe", "pho", "Phở", "/recipes/pho", "..."), 1.0),
        rag.Hit(rag.Chunk("b", "article", "rau", "Rau", "/articles/rau", "..."), 0.5),
    ]
    text, cited = rag.extract_citations("Hầm 3 giờ [1]. Cất ngăn mát [2, 1]. Sai [9].", hits)
    assert text == "Hầm 3 giờ. Cất ngăn mát. Sai."
    assert [hit.chunk.url for hit in cited] == ["/recipes/pho", "/articles/rau"]


def test_ai_reply_is_grounded_and_returns_sources(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed(database_session_factory)
    seen: dict[str, Any] = {}

    def fake_generate(**kwargs: Any) -> str:
        seen.update(kwargs)
        return "Ướp **Gà kho gừng** 30 phút [1] rồi kho lửa nhỏ nhé!"

    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "generate_reply", fake_generate)
    response = client.post("/api/v1/assistant/chat", json={"message": "Ướp gà kho gừng bao lâu?"})
    assert response.status_code == 200, response.text
    reply = response.json()["reply"]
    assert "<tai_lieu>" in seen["knowledge"] and "30 phút" in seen["knowledge"]
    assert seen["candidates"][0].slug == "ga-kho-gung"
    assert "[1]" not in reply["content"]
    assert reply["sources"][0]["url"] == "/recipes/ga-kho-gung"
    assert [card["slug"] for card in reply["recipes"]] == ["ga-kho-gung"]


def test_local_mode_answers_from_knowledge_when_engine_has_no_intent(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    response = client.post(
        "/api/v1/assistant/chat", json={"message": "Bảo quản rau thơm trong tủ lạnh sao cho tươi?"}
    )
    assert response.status_code == 200, response.text
    reply = response.json()["reply"]
    assert reply["mode"] == "local"
    assert "khăn giấy ẩm" in reply["content"]
    assert reply["sources"] == [
        {"title": "Mẹo bảo quản rau thơm", "url": "/articles/bao-quan-rau-thom", "kind": "article"}
    ]


def test_follow_up_query_reuses_previous_question() -> None:
    history = [("user", "Cách nấu phở bò"), ("assistant", "Đây nè")]
    assert rag.build_query("còn gì nữa?", history) == "Cách nấu phở bò\ncòn gì nữa?"
    long = "Cho mình hỏi cách hầm xương bò cho nước dùng trong"
    assert rag.build_query(long, history) == long


def test_confidence_rejects_accent_collisions() -> None:
    cao_lau = rag.Chunk(
        "recipe:cao-lau:overview",
        "recipe",
        "cao-lau-hoi-an",
        "Cao lầu Hội An",
        "/recipes/cao-lau-hoi-an",
        "Món Cao lầu Hội An: sợi dai, thịt thơm. Rau và gia vị để riêng.",
    )
    herbs = rag.Chunk(
        "article:rau:1",
        "article",
        "rau",
        "Mẹo bảo quản rau thơm",
        "/articles/rau",
        "Cuộn rau thơm trong khăn giấy ẩm để giữ tươi lâu.",
    )
    query = "Làm sao giữ rau thơm tươi lâu?"
    assert not rag.confident(query, cao_lau)
    assert rag.confident(query, herbs)
    assert rag.names_source("Phở bò hầm bao lâu?", rag.Chunk("", "", "", "Phở bò Hà Nội", "", ""))
    assert rag.is_question("Cách nấu phở bò") and not rag.is_question("Gợi ý món giống phở bò")


def test_local_mode_answers_dish_specific_questions_from_the_recipe(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    response = client.post(
        "/api/v1/assistant/chat", json={"message": "Nước dùng phở bò hầm xương bao lâu?"}
    )
    reply = response.json()["reply"]
    assert "3 giờ" in reply["content"]
    assert reply["sources"][0]["url"] == "/recipes/pho-bo-ha-noi"
