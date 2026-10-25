import base64
import io
import zipfile
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.assistant import documents
from tests.helpers import create_admin, register_and_login

W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
P_NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'


def make_zip(files: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def para(text: str, props: str = "") -> str:
    return f"<w:p><w:pPr>{props}</w:pPr><w:r><w:t>{text}</w:t></w:r></w:p>"


def make_docx() -> bytes:
    body = (
        f"<w:document {W_NS}><w:body>"
        + para("Chính sách giao hàng", '<w:pStyle w:val="Heading1"/>')
        + para("Bếp Việt giao nguyên liệu nội thành Hà Nội từ 8 giờ đến 20 giờ.")
        + para("Miễn phí cho đơn từ 300.000đ", "<w:numPr/>")
        + "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Khu vực</w:t></w:r></w:p></w:tc>"
        "<w:tc><w:p><w:r><w:t>Phí ship</w:t></w:r></w:p></w:tc></w:tr>"
        "<w:tr><w:tc><w:p><w:r><w:t>Ngoại thành</w:t></w:r></w:p></w:tc>"
        "<w:tc><w:p><w:r><w:t>25.000đ</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"
        "</w:body></w:document>"
    )
    return make_zip({"word/document.xml": body})


def slide(text: list[str]) -> str:
    paragraphs = "".join(f"<a:p><a:r><a:t>{line}</a:t></a:r></a:p>" for line in text)
    return f"<p:sld {P_NS} {A_NS}><p:cSld><p:spTree>{paragraphs}</p:spTree></p:cSld></p:sld>"


def make_pptx() -> bytes:
    return make_zip(
        {
            "ppt/slides/slide2.xml": slide(["Mẹo luộc rau xanh", "Cho chút muối vào nước sôi."]),
            "ppt/slides/slide1.xml": slide(["Lớp học nấu ăn tháng 11", "Mở lớp vào thứ Bảy."]),
            "ppt/notesSlides/notesSlide2.xml": slide(["Vớt rau ra ngâm nước đá", "2"]),
        }
    )


def data_url(data: bytes, content_type: str = "application/octet-stream") -> str:
    return f"data:{content_type};base64,{base64.b64encode(data).decode()}"


def upload(client: TestClient, headers: dict[str, str], name: str, data: bytes, **extra: Any):
    return client.post(
        "/api/v1/admin/assistant/documents/upload",
        json={"file_name": name, "data": data_url(data), **extra},
        headers=headers,
    )


def test_extract_docx_keeps_headings_lists_and_tables() -> None:
    text = documents.extract_text("giao-hang.docx", make_docx())
    assert "Chính sách giao hàng" in text
    assert "- Miễn phí cho đơn từ 300.000đ" in text
    assert "Ngoại thành | 25.000đ" in text


def test_extract_pptx_orders_slides_and_reads_notes() -> None:
    text = documents.extract_text("lop-hoc.pptx", make_pptx())
    assert text.index("Trang 1: Lớp học") < text.index("Trang 2: Mẹo luộc rau")
    assert "Ghi chú: Vớt rau ra ngâm nước đá" in text
    assert "Ghi chú: Vớt rau ra ngâm nước đá 2" not in text


@pytest.mark.parametrize(
    ("name", "data", "message"),
    [
        ("cu.doc", b"x" * 40, "Hãy lưu lại dưới dạng .docx"),
        ("anh.png", b"x" * 40, "Chưa hỗ trợ"),
        ("hong.docx", b"not a zip file at all", "không đúng định dạng"),
        (
            "doc-hai.docx",
            make_zip({"word/document.xml": '<!DOCTYPE x [<!ENTITY a "b">]><w:document/>'}),
            "không an toàn",
        ),
        ("rong.txt", b"   ", "không có chữ"),
    ],
)
def test_extract_rejects_unsupported_or_unsafe_files(name: str, data: bytes, message: str) -> None:
    with pytest.raises(documents.DocumentError, match=message):
        documents.extract_text(name, data)


def test_admin_teaches_assistant_and_chat_answers_from_it(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    admin = create_admin(client, database_session_factory, "teacher@example.com")
    created = upload(client, admin, "Chinh_sach_giao_hang.docx", make_docx())
    assert created.status_code == 201, created.text
    document = created.json()
    assert document["title"] == "Chinh sach giao hang"
    assert document["source"] == "file" and "20 giờ" in document["text"]

    note = client.post(
        "/api/v1/admin/assistant/documents",
        json={"title": "Giờ mở cửa bếp", "text": "Bếp demo mở cửa thứ Bảy, 9 giờ sáng."},
        headers=admin,
    )
    assert note.status_code == 201, note.text

    listing = client.get("/api/v1/admin/assistant/documents", headers=admin).json()
    assert {item["title"] for item in listing["data"]} == {"Giờ mở cửa bếp", "Chinh sach giao hang"}
    assert listing["status"]["by_type"]["doc"] >= 2

    member = register_and_login(client, "learner@example.com")
    reply = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Bếp Việt giao nguyên liệu nội thành mấy giờ?"},
        headers=member,
    ).json()["reply"]
    assert "8 giờ đến 20 giờ" in reply["content"]
    assert reply["sources"] == [{"title": "Chinh sach giao hang", "url": "", "kind": "doc"}]

    disabled = client.patch(
        f"/api/v1/admin/assistant/documents/{document['id']}",
        json={"active": False},
        headers=admin,
    )
    assert disabled.json()["active"] is False
    after = client.post(
        "/api/v1/assistant/chat",
        json={"message": "Bếp Việt giao nguyên liệu nội thành mấy giờ?"},
        headers=member,
    ).json()["reply"]
    assert "20 giờ" not in after["content"]

    gone = client.delete(f"/api/v1/admin/assistant/documents/{document['id']}", headers=admin)
    assert gone.status_code == 204
    missing = client.get(f"/api/v1/admin/assistant/documents/{document['id']}", headers=admin)
    assert missing.status_code == 404


def test_only_admins_can_teach(client: TestClient) -> None:
    member = register_and_login(client, "student@example.com")
    response = upload(client, member, "x.txt", "Một ghi chú đủ dài để học.".encode())
    assert response.status_code == 403
    assert client.get("/api/v1/admin/assistant/documents").status_code == 401


def test_upload_reports_extraction_errors(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    admin = create_admin(client, database_session_factory, "teacher2@example.com")
    response = upload(client, admin, "cu.ppt", b"x" * 64)
    assert response.status_code == 400
    assert ".pptx" in response.json()["message"]
