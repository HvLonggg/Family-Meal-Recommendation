"""Account settings, avatars, kitchen stories, recipe suggestions and support requests.

Revision ID: 0012_community_admin_settings
Revises: 0011_planner_meal_status
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision: str = "0012_community_admin_settings"
down_revision: str | Sequence[str] | None = "0011_planner_meal_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:  # type: ignore[type-arg]
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


EDITORIAL_ARTICLES = [
    {
        "slug": "mot-mam-com-du-vi-bat-dau-tu-dau",
        "title": "Một mâm cơm đủ vị bắt đầu từ đâu?",
        "category": "tips",
        "recipe_slug": "ca-chep-kho-rieng",
        "excerpt": (
            "Không cần quá nhiều món. Chọn đúng vai trò của từng món và sắp thứ tự nấu hợp lý, "
            "bữa cơm ngày thường cũng trọn vẹn."
        ),
        "body": (
            "Mâm cơm nhà Việt quen thuộc thường xoay quanh ba vai trò: một món mặn để đưa cơm, "
            "một món canh để cân bằng và một món rau để thanh vị.\n\n"
            "Hãy bắt đầu từ món cần thời gian lâu nhất, thường là món kho hoặc món hầm. Trong lúc "
            "nồi kho liu riu, bạn sơ chế rau và chuẩn bị nồi canh.\n\n"
            "Món rau nên làm cuối cùng để giữ màu xanh và độ giòn. Khi dọn lên, mọi món đều còn "
            "nóng và cả nhà có thể ngồi vào mâm cùng lúc.\n\n"
            "Mẹo nhỏ: chọn các món dùng chung nguyên liệu như hành, tỏi, cà chua để giảm thời gian "
            "sơ chế và tránh thừa nguyên liệu trong tủ lạnh."
        ),
    },
    {
        "slug": "chuan-bi-bua-com-4-nguoi-trong-45-phut",
        "title": "Chuẩn bị bữa cơm 4 người trong 45 phút",
        "category": "tips",
        "recipe_slug": "canh-chua-ca",
        "excerpt": (
            "Cách chọn một món kho, một món canh và một món rau để dùng chung nguyên liệu, "
            "tiết kiệm thời gian."
        ),
        "body": (
            "Phút 0–10: bắc nồi cơm, ướp món mặn và đun nước dùng cho canh.\n\n"
            "Phút 10–25: bắt đầu kho hoặc rim món mặn, trong lúc đó nhặt và rửa rau.\n\n"
            "Phút 25–40: nấu canh, nêm nếm và tắt bếp khi rau vừa chín tới.\n\n"
            "Phút 40–45: xào rau thật nhanh trên lửa lớn, dọn mâm và mời cả nhà.\n\n"
            "Lên kế hoạch tuần trên Bếp Việt giúp bạn biết trước nguyên liệu cần mua, nên mỗi "
            "buổi chiều chỉ còn việc nấu."
        ),
    },
    {
        "slug": "chon-rau-tuoi-bang-5-dau-hieu-de-nho",
        "title": "Chọn rau tươi bằng 5 dấu hiệu dễ nhớ",
        "category": "ingredients",
        "recipe_slug": "rau-muong-xao-toi",
        "excerpt": (
            "Quan sát màu lá, thân, độ ẩm và mùi để chọn được bó rau tươi cho bữa cơm nhà."
        ),
        "body": (
            "1. Màu lá tươi tự nhiên, không xanh đậm bất thường hay vàng úa.\n\n"
            "2. Thân rau chắc, bẻ thấy giòn, không nhũn ở gốc.\n\n"
            "3. Lá khô ráo, không có mùi hăng lạ hay mùi hóa chất.\n\n"
            "4. Ưu tiên rau đúng mùa: vừa ngon vừa ít phải dùng thuốc bảo vệ thực vật.\n\n"
            "5. Bó rau có vài lỗ sâu nhỏ không đáng ngại, nhưng tránh rau dập nát.\n\n"
            "Sau khi mua, nhặt bỏ lá hỏng, để ráo và bảo quản trong túi giấy ở ngăn mát."
        ),
    },
    {
        "slug": "vi-com-nha-trong-gian-bep-ba-mien",
        "title": "Vị cơm nhà trong gian bếp ba miền",
        "category": "culture",
        "recipe_slug": "bun-cha-ha-noi",
        "excerpt": (
            "Cùng tìm hiểu cách vị mặn, ngọt, cay và chua tạo nên nét riêng của bữa cơm mỗi miền."
        ),
        "body": (
            "Miền Bắc chuộng vị thanh, nêm vừa phải để giữ vị ngọt tự nhiên của nguyên liệu.\n\n"
            "Miền Trung đậm đà và cay hơn, nhiều món dùng ớt, sả và mắm để tạo vị mạnh mẽ.\n\n"
            "Miền Nam ưa vị ngọt và chua dịu, rau thơm phong phú, món canh chua là biểu tượng "
            "của mâm cơm miền sông nước.\n\n"
            "Dù khác biệt, điểm chung của cơm nhà ba miền vẫn là sự quây quần và tinh thần "
            "dùng nguyên liệu theo mùa."
        ),
    },
]


def upgrade() -> None:
    op.add_column("users", sa.Column("preferences", sa.JSON(), server_default="{}", nullable=False))
    op.add_column("users", sa.Column("avatar_data", sa.LargeBinary(), nullable=True))
    op.add_column("users", sa.Column("avatar_content_type", sa.String(length=32), nullable=True))
    op.add_column(
        "users", sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))

    articles = op.create_table(
        "articles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("slug", sa.String(length=220), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("excerpt", sa.String(length=400), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=60), nullable=False),
        sa.Column("recipe_slug", sa.String(length=180), nullable=True),
        sa.Column("cover_data", sa.LargeBinary(), nullable=True),
        sa.Column("cover_content_type", sa.String(length=32), nullable=True),
        sa.Column("cover_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("moderation_note", sa.String(length=300), nullable=True),
        sa.Column("reading_minutes", sa.Integer(), server_default="1", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_articles_slug"),
    )
    op.create_index("ix_articles_author_id", "articles", ["author_id"])
    op.create_index("ix_articles_kind", "articles", ["kind"])
    op.create_index("ix_articles_slug", "articles", ["slug"])
    op.create_index("ix_articles_category", "articles", ["category"])
    op.create_index("ix_articles_status", "articles", ["status"])
    op.create_index("ix_articles_status_published", "articles", ["status", "published_at"])
    op.create_index("ix_articles_author_updated", "articles", ["author_id", "updated_at"])

    op.create_table(
        "recipe_submissions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("region", sa.String(length=32), nullable=False),
        sa.Column("category", sa.String(length=48), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=False),
        sa.Column("total_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("story", sa.Text(), nullable=False),
        sa.Column("ingredients", sa.Text(), nullable=False),
        sa.Column("steps", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("admin_note", sa.String(length=300), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recipe_submissions_user_id", "recipe_submissions", ["user_id"])
    op.create_index("ix_recipe_submissions_status", "recipe_submissions", ["status"])
    op.create_index(
        "ix_recipe_submissions_status_created", "recipe_submissions", ["status", "created_at"]
    )

    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("topic", sa.String(length=24), nullable=False),
        sa.Column("subject", sa.String(length=160), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("admin_note", sa.String(length=500), nullable=True),
        sa.Column("requester_key", sa.String(length=64), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
    op.create_index("ix_support_tickets_status", "support_tickets", ["status"])
    op.create_index("ix_support_tickets_requester_key", "support_tickets", ["requester_key"])
    op.create_index(
        "ix_support_tickets_status_created", "support_tickets", ["status", "created_at"]
    )

    now = datetime.now(UTC)
    op.bulk_insert(
        articles,
        [
            {
                "id": uuid.uuid4(),
                "author_id": None,
                "kind": "editorial",
                "status": "published",
                "reading_minutes": 3,
                "published_at": now,
                "created_at": now,
                "updated_at": now,
                **article,
            }
            for article in EDITORIAL_ARTICLES
        ],
    )


def downgrade() -> None:
    op.drop_table("support_tickets")
    op.drop_table("recipe_submissions")
    op.drop_table("articles")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "avatar_updated_at")
    op.drop_column("users", "avatar_content_type")
    op.drop_column("users", "avatar_data")
    op.drop_column("users", "preferences")
