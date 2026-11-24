"""Địa chỉ IP thật của người gọi, dùng cho giới hạn tần suất."""

from fastapi import Request

from app.core.config import get_settings


def client_ip(request: Request) -> str:
    """IP do proxy tin cậy ngoài cùng ghi vào, không phải giá trị client tự điền.

    Mỗi proxy *nối thêm* IP người gọi nó vào cuối X-Forwarded-For. Với N proxy tin cậy
    (BEP_VIET_TRUSTED_PROXY_HOPS), hop thứ N tính từ phải là IP người dùng thật; các hop bên
    trái hơn có thể bị client giả mạo. Ví dụ Vercel -> Render: "người dùng, IP Vercel" -> N=2.
    """
    hops = [hop.strip() for hop in request.headers.get("x-forwarded-for", "").split(",")]
    hops = [hop for hop in hops if hop]
    if hops:
        index = max(len(hops) - get_settings().trusted_proxy_hops, 0)
        return hops[index][:64]
    return request.client.host if request.client else "unknown"
