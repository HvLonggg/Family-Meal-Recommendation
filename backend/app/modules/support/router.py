from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.core.net import client_ip
from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user, get_optional_user
from app.modules.auth.models import User
from app.modules.auth.security import token_digest
from app.modules.support.models import SupportTicket
from app.modules.support.schemas import (
    SupportTicketCreate,
    SupportTicketListResponse,
    SupportTicketReceipt,
    SupportTicketResponse,
)
from app.modules.support.service import ticket_reference

router = APIRouter(prefix="/support")
HOURLY_LIMIT = 5

DatabaseSession = Annotated[Session, Depends(get_db_session)]


class SupportRateLimitError(DomainError):
    code = "SUPPORT_RATE_LIMITED"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


@router.post(
    "/tickets",
    response_model=SupportTicketReceipt,
    status_code=status.HTTP_201_CREATED,
    summary="Send a support request",
)
def create_ticket(
    payload: SupportTicketCreate,
    request: Request,
    session: DatabaseSession,
    viewer: Annotated[User | None, Depends(get_optional_user)],
) -> SupportTicketReceipt:
    support_email = get_settings().support_email
    message = (
        f"Bếp Việt đã tiếp nhận yêu cầu và đưa nội dung vào hàng đợi gửi tới {support_email}. "
        "Chúng tôi sẽ phản hồi qua email trong 1–2 ngày làm việc."
    )
    if payload.website:
        # Bot điền trường ẩn: trả về như thành công để không lộ cơ chế chặn.
        fake_id = uuid4()
        return SupportTicketReceipt(
            id=fake_id, reference=ticket_reference(fake_id), message=message
        )

    caller_ip = client_ip(request)
    requester_key = token_digest(f"support:{caller_ip}")
    recent = session.scalar(
        select(func.count())
        .select_from(SupportTicket)
        .where(
            SupportTicket.requester_key == requester_key,
            SupportTicket.created_at >= datetime.now(UTC) - timedelta(hours=1),
        )
    )
    if (recent or 0) >= HOURLY_LIMIT:
        raise SupportRateLimitError("Bạn đã gửi khá nhiều yêu cầu. Vui lòng thử lại sau ít phút.")

    ticket = SupportTicket(
        user_id=viewer.id if viewer else None,
        name=payload.name,
        email=payload.email,
        topic=payload.topic,
        subject=payload.subject,
        message=payload.message,
        requester_key=requester_key,
        notification_attempts=0,
        notification_next_attempt_at=datetime.now(UTC),
    )
    session.add(ticket)
    session.commit()
    return SupportTicketReceipt(
        id=ticket.id, reference=ticket_reference(ticket.id), message=message
    )


@router.get("/tickets/mine", response_model=SupportTicketListResponse, summary="My requests")
def my_tickets(
    session: DatabaseSession, current_user: Annotated[User, Depends(get_current_user)]
) -> SupportTicketListResponse:
    items = list(
        session.scalars(
            select(SupportTicket)
            .where(SupportTicket.user_id == current_user.id)
            .order_by(SupportTicket.created_at.desc())
            .limit(50)
        )
    )
    return SupportTicketListResponse(
        data=[SupportTicketResponse.model_validate(item) for item in items], total=len(items)
    )
