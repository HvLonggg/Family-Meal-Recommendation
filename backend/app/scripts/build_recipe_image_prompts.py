"""Build a copy-ready, dish-specific image prompt pack from the Bếp Việt catalog."""

import json
from typing import Any

from app.scripts.import_recipe_catalog import ROOT, read_catalog, recipe_slug

OUTPUT = ROOT / "docs/recipe-image-generation"


def prompt_for(item: dict[str, Any]) -> str:
    region_names = {"Bắc": "Northern", "Trung": "Central", "Nam": "Southern"}
    regions = [region_names.get(value, value.lower()) for value in item["region"]]
    regional_style = f" {', '.join(regions)} Vietnamese home-cooking style"
    category = item["category"].casefold()
    dish_name = item["name"].casefold()
    if any(
        word in category or word in dish_name
        for word in ("canh", "phở", "bún", "miến", "cháo", "súp")
    ):
        vessel = "one complete, elegant ceramic soup bowl containing the dish"
    elif any(
        word in category or word in dish_name for word in ("chè", "tráng miệng", "kem", "sữa chua")
    ):
        vessel = "one complete, elegant dessert bowl or glass suited to the dish"
    elif any(word in dish_name for word in ("kho", "rim", "om", "sốt", "cà ri")):
        vessel = "one complete, tasteful shallow ceramic serving bowl suited to this braised dish"
    else:
        vessel = "one complete, tasteful ceramic serving plate suited to this Vietnamese dish"

    main_ingredients = [
        ingredient["name"] for ingredient in item["ingredients"] if ingredient["role"] == "main"
    ][:6]
    if not main_ingredients:
        main_ingredients = [ingredient["name"] for ingredient in item["ingredients"][:6]]
    signature = " ".join(item["finished_dish"].split())
    if len(signature) > 420:
        signature = f"{signature[:417].rsplit(' ', 1)[0]}…"

    return (
        f"Use case: photorealistic-natural / product-mockup. Create one original premium "
        f"Vietnamese food photograph for Bếp Việt, showing {item['name']}{regional_style}. "
        f"The exact named recipe is the subject; correctly depict its real cooking technique "
        f"and ingredients rather than a generic meal. Finished-dish reference: {signature} "
        f"Key ingredients to show where appropriate: {', '.join(main_ingredients)}. "
        f"Show ONLY {vessel}. Keep the complete food and the complete vessel visible, centered, "
        f"with generous transparent safety margins on every side; never clip the rim or any "
        f"corner. Use a natural 35-degree overhead three-quarter camera angle, lifelike cooked "
        f"textures, restrained natural color, crisp fine detail, soft professional studio "
        f"daylight and a subtle contact shadow. The entire surrounding canvas must be a truly "
        f"transparent alpha background. No table, cloth, backdrop, cutlery, extra dishes, "
        f"decoration, border, frame, rectangular card, text, brand, logo, watermark or collage. "
        f"No CGI, illustration, plastic-looking food, artificial shine or oversaturation. "
        f"One single dish and one image only. Wide landscape 16:9 composition intended for a "
        f"3840 × 2160 transparent export; request the highest native detail available. Create "
        f"a new Bếp Việt image from this recipe description without copying another publisher's "
        f"photograph. The catalog ID is for file naming only and must not appear in the image."
    )


def main() -> None:
    items = read_catalog()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = [
        {
            "id": item["id"],
            "name": item["name"],
            "slug": recipe_slug(item),
            "save_as": f"output/recipe-images/inbox/{recipe_slug(item)}.png",
            "prompt": prompt_for(item),
        }
        for item in items
    ]
    markdown = [
        "# Prompt tạo 300 ảnh món ăn Bếp Việt",
        "",
        "Mỗi prompt tạo **một ảnh mới** theo bộ mẫu hiện có: ảnh món ăn cắt nền trong suốt, "
        "đĩa/bát và thức ăn thấy trọn vẹn, bố cục ngang 16:9, chi tiết cao, không viền/khung. "
        "Dùng `output/recipe-images/progress.json` làm nguồn tiến độ và chỉ tạo món còn nằm "
        "trong `pendingRecipes`; món kế tiếp sau 10 ảnh mẫu là `thit-kho-tieu`. Lưu PNG có "
        "alpha vào `output/recipe-images/inbox/<slug>.png`, rồi xuất qua bộ chuyển đổi ảnh "
        "hiện có. Ảnh 3840 × 2160 trong dự án là bản xuất 4K từ ảnh render gốc; không gọi "
        "đó là render gốc 4K. Không dùng ảnh nguồn bên ngoài làm ảnh đầu vào.",
        "",
        "## Các prompt",
        "",
    ]
    for record in records:
        markdown.extend(
            [
                f"### {record['id']} · {record['name']}",
                "",
                f"Tệp nhận ảnh: `output/recipe-images/inbox/{record['slug']}.png` · "
                f"URL món: `/recipes/{record['slug']}`",
                "",
                "```text",
                record["prompt"],
                "```",
                "",
            ]
        )
    (OUTPUT / "prompts-300.md").write_text("\n".join(markdown), encoding="utf-8")
    (OUTPUT / "prompts-300.jsonl").write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )
    print(json.dumps({"prompts": len(records), "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
