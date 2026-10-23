"""Địa chỉ IP thật của người gọi, dùng cho giới hạn tần suất."""

from fastapi import Request


def client_ip(request: Request) -> str:
    """IP do proxy tin cậy gần nhất (nginx/Render) ghi vào, không phải giá trị client tự điền.

    Mỗi proxy *nối thêm* IP người gọi vào cuối X-Forwarded-For, nên hop bên phải nhất là do
    proxy của mình ghi; các hop bên trái có thể bị client giả mạo để lách giới hạn tần suất.
    """
    hops = [hop.strip() for hop in request.headers.get("x-forwarded-for", "").split(",")]
    hops = [hop for hop in hops if hop]
    if hops:
        return hops[-1][:64]
    return request.client.host if request.client else "unknown"
