from decimal import Decimal
from typing import Any

from sqlalchemy import select

from app.db.session import SessionLocal
from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep

RecipeSeed = dict[str, Any]

RECIPE_SEEDS: list[RecipeSeed] = [
    {
        "slug": "ca-chep-kho-rieng",
        "name": "Cá chép kho riềng",
        "excerpt": "Cá chắc thịt, thơm riềng và thấm vị; món mặn quen thuộc của cơm nhà miền Bắc.",
        "region": "Bắc",
        "category": "Món mặn",
        "difficulty": "Dễ",
        "prep_minutes": 30,
        "cook_minutes": 45,
        "base_servings": 4,
        "image_path": "ca-chep-kho-rieng.jpg",
        "image_alt": "Nồi cá chép kho riềng màu nâu hổ phách",
        "serving": "Dùng nóng cùng cơm trắng, rau luộc và một bát canh thanh.",
        "tip": "Kho lửa nhỏ, chỉ nghiêng nồi thay vì dùng đũa đảo để cá không vỡ.",
        "source_name": "Món Ngon Mỗi Ngày",
        "source_url": "https://monngonmoingay.com/ca-chep-kho-rieng/",
        "ingredients": [
            ("Nguyên liệu chính", "Cá chép", "500", "g", None, True),
            ("Nguyên liệu chính", "Thịt ba chỉ", "50", "g", None, True),
            ("Nguyên liệu chính", "Riềng tươi", "100", "g", None, True),
            ("Nguyên liệu chính", "Lá trà xanh", "200", "g", None, True),
            ("Nguyên liệu chính", "Mía", "1", "khúc 40 cm", None, True),
            ("Gia vị", "Nước tương", "5", "muỗng canh", None, True),
            ("Gia vị", "Dầu điều", "1", "muỗng canh", None, True),
            ("Gia vị", "Nước màu", "1", "muỗng cà phê", None, True),
            ("Gia vị", "Tiêu, ớt và hành lá", None, "vừa đủ", None, False),
        ],
        "preparation": [
            "Chẻ mía vừa đáy nồi; hã lá trà xanh hai lượt để lấy gần 3 chén nước trà.",
            "Rửa cá với muối và giấm, thấm khô rồi ướp cùng nước riềng và gia vị 30 phút.",
            "Cắt nhỏ thịt ba chỉ; chiên sơ cá cùng vài lát riềng để bề mặt săn lại.",
        ],
        "cooking": [
            "Lót mía dưới đáy niêu, xếp cá, thịt, riềng rồi rưới phần nước ướp lên trên.",
            "Đun lửa lớn cho cá săn, thêm nước trà rồi kho lửa nhỏ đến khi nước sền sệt.",
        ],
    },
    {
        "slug": "suon-xao-chua-ngot",
        "name": "Sườn xào chua ngọt",
        "excerpt": "Sườn mềm, áo xốt chua ngọt cân bằng, hợp cả người lớn lẫn trẻ nhỏ.",
        "region": "Ba miền",
        "category": "Món mặn",
        "difficulty": "Dễ",
        "prep_minutes": 15,
        "cook_minutes": 20,
        "base_servings": 4,
        "image_path": "suon-xao-chua-ngot.jpg",
        "image_alt": "Đĩa sườn xào chua ngọt với ớt chuông và hành tây",
        "serving": "Dọn nóng với cơm trắng, rắc thêm một ít tiêu nếu thích.",
        "tip": "Chần sườn trước và cho rau củ vào cuối để món trong vị, rau còn giòn.",
        "source_name": "Món Ngon Mỗi Ngày",
        "source_url": "https://monngonmoingay.com/suon-xao-chua-ngot/",
        "ingredients": [
            ("Nguyên liệu chính", "Sườn non", "400", "g", None, True),
            ("Nguyên liệu chính", "Ớt chuông ba màu", "3", "quả", None, True),
            ("Nguyên liệu chính", "Hành tây", "1", "củ", None, True),
            ("Nguyên liệu chính", "Lòng trắng trứng", "1", "phần", None, True),
            ("Nguyên liệu chính", "Bột năng", "2", "muỗng canh", None, True),
            ("Xốt chua ngọt", "Giấm gạo", "0.5", "muỗng canh", None, True),
            ("Xốt chua ngọt", "Đường", "1", "muỗng canh", None, True),
            ("Xốt chua ngọt", "Tương cà", "1", "muỗng canh", None, True),
        ],
        "preparation": [
            "Chặt sườn dài khoảng 4 cm, ướp 10 phút rồi trộn lòng trắng trứng và áo bột mỏng.",
            "Cắt rau củ thành miếng 3 cm; khuấy giấm, đường, nước tương và tương cà thành xốt.",
        ],
        "cooking": [
            "Xào nhanh rau củ rồi trút ra; chiên sườn vàng đều và để ráo dầu.",
            "Đun xốt với sườn khoảng 5 phút, làm sánh nhẹ rồi cho rau củ trở lại chảo.",
        ],
    },
    {
        "slug": "canh-chua-ca",
        "name": "Canh chua cá",
        "excerpt": "Vị chua dịu từ me và dứa, cá mềm ngọt, nhiều rau, hợp ngày nóng.",
        "region": "Nam",
        "category": "Món canh",
        "difficulty": "Dễ",
        "prep_minutes": 15,
        "cook_minutes": 15,
        "base_servings": 4,
        "image_path": "canh-chua-ca.jpg",
        "image_alt": "Bát canh chua cá với cà chua, dứa và đậu bắp",
        "serving": "Dùng nóng trong bữa cơm hoặc ăn kèm bún.",
        "tip": "Cho cá khi nước sôi nhẹ và không khuấy mạnh để cá không nát.",
        "source_name": "Món Ngon Mỗi Ngày",
        "source_url": "https://monngonmoingay.com/canh-chua-ca-mien-nam/",
        "ingredients": [
            ("Cá và rau", "Cá liệt, cá diêu hồng hoặc cá lóc", "250", "g", None, True),
            ("Cá và rau", "Thơm", "100", "g", None, True),
            ("Cá và rau", "Cà chua", "100", "g", None, True),
            ("Cá và rau", "Bạc hà", "100", "g", None, True),
            ("Tạo vị", "Nước", "1.7", "lít", None, True),
            ("Tạo vị", "Nước mắm", "2", "muỗng canh", None, True),
        ],
        "preparation": [
            "Làm sạch cá và để ráo; cắt cà chua, thơm và bạc hà thành miếng vừa ăn.",
            "Rửa rau om, hành lá và cắt nhỏ; chuẩn bị sẵn gia vị chua cay.",
        ],
        "cooking": [
            "Phi hành tím, xào cà chua rồi thêm 1,7 lít nước; cho cá và thơm vào, hớt bọt.",
            "Nấu cá khoảng 5 phút, thêm bạc hà, nêm vị rồi cho rau thơm và tắt bếp.",
        ],
    },
    {
        "slug": "trung-chien-rau-cu",
        "name": "Trứng chiên rau củ",
        "excerpt": "Món nhanh gọn trong 15 phút, màu sắc vui mắt và dễ ăn cùng cơm nóng.",
        "region": "Ba miền",
        "category": "Món mặn",
        "difficulty": "Dễ",
        "prep_minutes": 8,
        "cook_minutes": 7,
        "base_servings": 4,
        "image_path": "trung-chien-rau-cu.jpg",
        "image_alt": "Đĩa trứng chiên vàng với cà rốt và đậu que",
        "serving": "Cắt miếng, dùng nóng với cơm và dưa leo.",
        "tip": "Chần rau củ trước giúp trứng chín đều mà rau vẫn giữ màu.",
        "source_name": "Món Ngon Mỗi Ngày",
        "source_url": "https://monngonmoingay.com/trung-chien-rau-cu-xot-mayonnaise/",
        "ingredients": [
            ("Nguyên liệu", "Trứng gà", "3", "quả", None, True),
            ("Nguyên liệu", "Cà chua", "0.5", "quả", None, True),
            ("Nguyên liệu", "Hành tây", "0.25", "củ", None, True),
            ("Nguyên liệu", "Đậu que", "5", "trái", None, True),
            ("Nguyên liệu", "Xốt mayonnaise", "2", "muỗng canh", None, True),
        ],
        "preparation": [
            "Bỏ hạt cà chua, cắt hạt lựu cùng hành tây; thái mỏng đậu que.",
            "Đánh nhẹ trứng với tiêu, hành lá và mayonnaise, không tạo quá nhiều bọt.",
        ],
        "cooking": [
            "Phi hành tím, xào sơ rau củ rồi hạ xuống lửa nhỏ.",
            "Rót trứng quanh chảo, đậy nắp và chiên đến khi trứng vừa chín vàng.",
        ],
    },
    {
        "slug": "rau-muong-xao-toi",
        "name": "Rau muống xào tỏi",
        "excerpt": "Rau xanh giòn, thơm tỏi, hoàn thiện mâm cơm trong khoảng 10 phút.",
        "region": "Ba miền",
        "category": "Món rau",
        "difficulty": "Dễ",
        "prep_minutes": 6,
        "cook_minutes": 4,
        "base_servings": 4,
        "image_path": "rau-muong-xao-toi-cc0.jpg",
        "image_alt": "Đĩa rau muống xào xanh với những lát tỏi",
        "serving": "Gắp ra đĩa và dùng ngay khi rau còn nóng, xanh và giòn.",
        "tip": "Chảo phải thật nóng, rau thật ráo và cần đảo nhanh trên lửa lớn.",
        "source_name": "Món Ngon Mỗi Ngày",
        "source_url": "https://monngonmoingay.com/cac-mon-an-ngon-de-lam-tai-nha/",
        "ingredients": [
            ("Nguyên liệu", "Rau muống", "500", "g", None, True),
            ("Nguyên liệu", "Tỏi", "5", "tép", None, True),
            ("Nguyên liệu", "Dầu ăn", "2", "muỗng canh", None, True),
        ],
        "preparation": [
            "Nhặt rau thành đoạn 8–10 cm, rửa sạch và để thật ráo.",
            "Đập dập tỏi, băm thô và chia thành hai phần.",
        ],
        "cooking": [
            "Phi thơm hai phần ba lượng tỏi trên chảo thật nóng rồi cho rau vào đảo nhanh.",
            "Nêm gia vị, đảo thêm 30–60 giây; thêm tỏi còn lại rồi gắp ra ngay.",
        ],
    },
    {
        "slug": "dau-hu-sot-ca-chua",
        "name": "Đậu hũ sốt cà chua",
        "excerpt": "Đậu hũ mềm béo trong xốt cà chua dịu, nguyên liệu bình dân và dễ nấu.",
        "region": "Ba miền",
        "category": "Món chay",
        "difficulty": "Dễ",
        "prep_minutes": 8,
        "cook_minutes": 15,
        "base_servings": 4,
        "image_path": "dau-hu-sot-ca-chua-cc-by-sa.jpg",
        "image_alt": "Đĩa đậu hũ vàng sốt cà chua và hành lá",
        "serving": "Rắc hành lá, dùng với cơm nóng và rau luộc.",
        "tip": "Áp chảo vừa vàng giúp miếng đậu đứng dáng mà bên trong vẫn mềm.",
        "source_name": "Món Ngon Mỗi Ngày",
        "source_url": "https://monngonmoingay.com/cac-mon-an-ngon-de-lam-tai-nha/",
        "ingredients": [
            ("Nguyên liệu", "Đậu hũ trắng", "4", "miếng", None, True),
            ("Nguyên liệu", "Cà chua", "4", "quả", None, True),
            ("Nguyên liệu", "Hành lá", "2", "nhánh", None, True),
        ],
        "preparation": [
            "Cắt đậu hũ, thấm khô; băm một nửa cà chua và bổ múi phần còn lại.",
            "Thái riêng đầu hành, pha sẵn nước mắm chay với đường và nước ấm.",
        ],
        "cooking": [
            "Áp chảo đậu vàng nhẹ; phi đầu hành và xào cà chua thành xốt.",
            "Cho đậu vào rim lửa nhỏ 5–7 phút, thêm hành lá và tiêu rồi tắt bếp.",
        ],
    },
]


def seed_recipes() -> int:
    synchronized = 0
    with SessionLocal() as session:
        for item in RECIPE_SEEDS:
            recipe = session.scalar(select(Recipe).where(Recipe.slug == item["slug"]))
            if recipe is None:
                recipe = Recipe()
                session.add(recipe)

            for key, value in item.items():
                if key not in {"ingredients", "preparation", "cooking"}:
                    setattr(recipe, key, value)
            recipe.status = "published"
            recipe.ingredients.clear()
            recipe.steps.clear()

            for position, ingredient in enumerate(item["ingredients"], start=1):
                group, name, amount, unit, note, scalable = ingredient
                recipe.ingredients.append(
                    RecipeIngredient(
                        group_name=group,
                        name=name,
                        amount=Decimal(amount) if amount is not None else None,
                        unit=unit,
                        note=note,
                        scalable=scalable,
                        position=position,
                    )
                )
            for step_type, key in (("so_che", "preparation"), ("thuc_hien", "cooking")):
                for position, content in enumerate(item[key], start=1):
                    recipe.steps.append(
                        RecipeStep(step_type=step_type, content=content, position=position)
                    )
            synchronized += 1
        session.commit()
    return synchronized


if __name__ == "__main__":
    count = seed_recipes()
    print(f"Đã đồng bộ {count} công thức mẫu với dữ liệu nguồn đã biên soạn.")
