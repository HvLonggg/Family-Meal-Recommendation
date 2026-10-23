"""Thông tin công khai của nhóm Bếp Việt dành cho Chú Rồng."""

from app.core.config import get_settings

FOUNDER_NAME = "Hoàng Văn Long"
FOUNDER_ROLE = "Nhà sáng lập & phụ trách sản phẩm"
FOUNDER_CITY = "Hà Nội"
CHEF_NAME = "Phạm Thu Quyên"
CONTACT_PHONE = "0364892903"
CONTACT_ADDRESS = "Ngõ 80/57 Mễ Trì Hạ, phường Từ Liêm, Hà Nội"


def brand_context(language: str) -> str:
    """Tạo thông tin chính thức, dùng cùng prompt cho cả hai ngôn ngữ."""
    support_email = get_settings().support_email.strip()
    if language == "en":
        return (
            "<thong_tin_bep_viet>\n"
            f"Founder and product author: {FOUNDER_NAME}, {FOUNDER_ROLE}, "
            f"based in {FOUNDER_CITY}.\n"
            f"Bếp Việt's chef: {CHEF_NAME}.\n"
            f"Public contact and support inbox: {support_email}.\n"
            f"Phone: {CONTACT_PHONE}. Address: {CONTACT_ADDRESS}.\n"
            "Support hours: Monday–Friday, 08:30–17:30 (GMT+7).\n"
            "Typical response: 1–2 business days.\n"
            "</thong_tin_bep_viet>"
        )
    return (
        "<thong_tin_bep_viet>\n"
        "Tác giả sản phẩm, nhà sáng lập và phụ trách sản phẩm: "
        f"{FOUNDER_NAME}; hiện ở {FOUNDER_CITY}.\n"
        f"Đầu bếp đồng hành cùng Bếp Việt: cô {CHEF_NAME}.\n"
        f"Email liên hệ và hòm thư hỗ trợ: {support_email}.\n"
        f"Điện thoại: {CONTACT_PHONE}. Địa chỉ: {CONTACT_ADDRESS}.\n"
        "Giờ hỗ trợ: Thứ Hai–Thứ Sáu, 08:30–17:30 (GMT+7).\n"
        "Thường phản hồi trong 1–2 ngày làm việc.\n"
        "</thong_tin_bep_viet>"
    )


def topic_reply(topic: str, language: str) -> tuple[str, list[dict[str, str]]]:
    """Câu trả lời xác định cho câu hỏi về nhóm và kênh liên hệ."""
    support_email = get_settings().support_email.strip()
    if topic == "about":
        if language == "en":
            return (
                f"Bếp Việt was created by {FOUNDER_NAME}, its founder and product lead "
                f"in {FOUNDER_CITY}. Chef {CHEF_NAME} contributes cooking expertise. "
                "You can reach the team on the Contact page.",
                [{"label": "Contact support", "to": "/contact"}],
            )
        return (
            f"Bếp Việt do {FOUNDER_NAME} sáng lập; anh giữ vai trò **{FOUNDER_ROLE}** "
            f"tại {FOUNDER_CITY}. Đầu bếp cô {CHEF_NAME} đồng hành về chuyên môn bếp. "
            "Bạn có thể gửi lời nhắn cho đội ngũ ở trang Liên hệ.",
            [{"label": "Liên hệ hỗ trợ", "to": "/contact"}],
        )

    if language == "en":
        return (
            f"Bếp Việt contact and support inbox: {support_email}; phone: {CONTACT_PHONE}; "
            f"address: {CONTACT_ADDRESS}. Support hours are Monday–Friday, 08:30–17:30 (GMT+7), "
            "with replies usually within 1–2 business days.",
            [{"label": "Contact support", "to": "/contact"}],
        )
    return (
        f"Email liên hệ và hòm thư hỗ trợ Bếp Việt: {support_email}; điện thoại: {CONTACT_PHONE}; "
        f"địa chỉ: {CONTACT_ADDRESS}. Giờ hỗ trợ từ Thứ Hai đến Thứ Sáu, 08:30–17:30 (GMT+7); "
        "thường phản hồi trong 1–2 ngày làm việc.",
        [{"label": "Liên hệ hỗ trợ", "to": "/contact"}],
    )
