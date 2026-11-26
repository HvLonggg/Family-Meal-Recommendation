"""Strict dish search shared by /api/v1/recipes?q= and the web catalog (recipeSearch.ts)."""

import pytest

from app.modules.recipes.search import (
    RecipeSearchFields,
    accent_key,
    matches_search,
    strict_search,
)


def dish(name: str, *ingredients: str, aliases: tuple[str, ...] = (), tags: tuple[str, ...] = ()):
    return RecipeSearchFields(
        names=[name], aliases=list(aliases), ingredients=list(ingredients), tags=list(tags)
    )


CATALOG = [
    dish("Canh chua cá", "Cá lóc", "Me chua", "Thơm", tags=("Món canh",)),
    dish("Canh cá đuối nấu xương rồng", "Cá đuối", aliases=("Canh chua cá đuối",)),
    dish("Canh cà chua trứng", "Cà chua", "Trứng gà"),
    dish("Canh cải thịt bằm", "Cải xanh", "Thịt bằm", "Cà chua", tags=("canh chua ngọt",)),
    dish("Canh cá khoai", "Cá khoai"),
    dish("Cá kho tộ", "Cá basa", "Gừng", "Thịt gà"),
    dish("Gà kho gừng", "Thịt gà", "Gừng"),
    dish("Gà kho nghệ", "Thịt gà", "Nghệ", "Gừng"),
    dish("Cơm gà Hội An", "Cơm", "Thịt gà"),
    dish("Bún thang", "Bún", "Thịt gà", "Trứng"),
    dish("Bún bò Huế", "Bún", "Bắp bò"),
    dish("Bún xào nghệ Huế", "Bún", "Thịt bò"),
    dish("Bò lúc lắc", "Thịt bò", "Bún tươi"),
    dish("Bún chả", "Bún", "Thịt heo"),
    dish("Bún riêu của mẹ", "Bún", "Cà chua"),
    dish("Bún riêu cua", "Bún", "Cua đồng"),
    dish("Phở bò Hà Nội", "Bánh phở", "Thịt bò"),
    dish("Phở cuốn Ngũ Xã", "Bánh phở lá", "Thịt bò", aliases=("Phở cuốn thịt bò",)),
    dish("Bánh canh Nam Phổ", "Bánh canh"),
    dish("Hủ tiếu Nam Vang", "Hủ tiếu", "Tôm"),
    dish("Cá chép kho riềng", "Cá chép", "Riềng", "Lá trà xanh"),
    dish("Cà tím nướng", "Cà tím"),
]


def search(query: str) -> list[str]:
    matches = sorted(strict_search(query, CATALOG), key=lambda match: match[1], reverse=True)
    return [CATALOG[index].names[0] for index, _ in matches]


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("canh chua cá", ["Canh chua cá", "Canh cá đuối nấu xương rồng"]),
        ("gà kho gừng", ["Gà kho gừng"]),
        ("cá kho", ["Cá kho tộ", "Cá chép kho riềng"]),
        ("phở bò", ["Phở bò Hà Nội", "Phở cuốn Ngũ Xã"]),
        ("bún riêu cua", ["Bún riêu cua"]),
        ("lá trà xanh", ["Cá chép kho riềng"]),
    ],
)
def test_multi_word_queries_require_every_word_in_the_name(query: str, expected: list[str]) -> None:
    assert search(query) == expected


def test_bun_bo_excludes_dishes_missing_a_word_of_the_name() -> None:
    results = search("bún bò")
    assert results[0] == "Bún bò Huế"
    assert "Bò lúc lắc" not in results
    assert "Bún chả" not in results
    # “bò” is a main ingredient of this noodle dish, so it may follow the exact name.
    assert results[1:] == ["Bún xào nghệ Huế"]


def test_unaccented_queries_match_every_tone_but_rank_names_first() -> None:
    assert search("bun bo hue")[0] == "Bún bò Huế"
    results = search("canh chua ca")
    assert results[0] == "Canh chua cá"
    assert "Canh cà chua trứng" in results
    assert "Canh cải thịt bằm" not in results
    assert "Bánh canh Nam Phổ" in search("pho")
    assert "Bánh canh Nam Phổ" not in search("phở")


def test_diacritics_keep_ca_and_cua_apart() -> None:
    assert "Canh chua cá" not in search("cà")
    assert search("cà")[:2] == ["Cà tím nướng", "Canh cà chua trứng"]
    assert "Bún riêu của mẹ" not in search("bún riêu cua")
    assert accent_key("hoà") == accent_key("hòa")


def test_single_generic_word_stays_broad_but_ranked() -> None:
    results = search("gà")
    assert results[:2] == ["Gà kho gừng", "Gà kho nghệ"]
    assert results[2] == "Cơm gà Hội An"
    assert {"Bún thang", "Cá kho tộ"} <= set(results[3:])


def test_typo_and_prefix_fallbacks_only_when_nothing_matches_exactly() -> None:
    assert search("phơ bo")[0] == "Phở bò Hà Nội"
    assert search("bun bo hu") == ["Bún bò Huế"]
    assert search("canh ch")[0] == "Canh chua cá"
    assert search("canh chuaa")[0] == "Canh chua cá"
    # “kho” is a complete word: never widened to “khoai”; short words never fuzzy-match.
    assert search("canh kho") == []
    assert search("gaa kho") == []


def test_generic_matcher_keeps_short_words_exact() -> None:
    assert not matches_search("khoo", "Cá kho tộ")
    assert matches_search("canh chuaa", "Canh chua cá")
