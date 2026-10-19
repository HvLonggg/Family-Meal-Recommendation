import pytest

from app.modules.planner.seasonings import is_pantry_seasoning


@pytest.mark.parametrize(
    "name",
    [
        "Nước mắm",
        "Muối",
        "Mì chính",
        "Bột ngọt",
        "Hạt nêm",
        "Đường phèn",
        "Dầu ăn",
        "Dầu hào",
        "Nước tương",
        "Tiêu xay",
        "Giấm gạo",
        "Mắm tôm",
        "Ngũ vị hương",
        "Hoa hồi",
        "Bột cà ri",
        "Chao",
    ],
)
def test_pantry_seasonings_go_to_seasoning_column(name: str) -> None:
    assert is_pantry_seasoning(name)


@pytest.mark.parametrize(
    "name",
    [
        "Hành tím",
        "Tỏi",
        "Gừng",
        "Sả",
        "Ớt",
        "Hành lá",
        "Rau răm",
        "Húng quế",
        "Đậu que",
        "Đậu phộng",
        "Hủ tiếu khô",
        "Nước dùng không muối",
        "Nước cốt chanh",
        "Thịt heo",
    ],
)
def test_fresh_produce_stays_with_ingredients(name: str) -> None:
    assert not is_pantry_seasoning(name)
