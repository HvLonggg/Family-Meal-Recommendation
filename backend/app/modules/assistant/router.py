from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.modules.assistant import ai, service
from app.modules.assistant.schemas import (
    AssistantStatus,
    ChatRequest,
    ChatResponse,
    ConversationDetail,
    ConversationList,
    ConversationRename,
    ConversationSummary,
)
from app.modules.auth.dependencies import get_current_user, get_optional_user
from app.modules.auth.models import User
from app.modules.auth.security import token_digest

router = APIRouter(prefix="/assistant")

DatabaseSession = Annotated[Session, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


@router.get("/status", response_model=AssistantStatus, summary="Assistant capabilities")
def assistant_status() -> AssistantStatus:
    return AssistantStatus(
        mode="ai" if ai.ai_enabled() else "local",
        name="Chú Rồng",
        accepts=service.ACCEPTS,
        max_attachments=3,
    )


@router.post("/chat", response_model=ChatResponse, summary="Chat with the kitchen assistant")
def chat(
    payload: ChatRequest, request: Request, session: DatabaseSession, viewer: OptionalUser
) -> ChatResponse:
    client_ip = request.client.host if request.client else "unknown"
    key = f"user:{viewer.id}" if viewer else token_digest(f"assistant:{client_ip}")
    service.check_rate_limit(key)
    return service.chat(session, payload=payload, user=viewer)


@router.get("/conversations", response_model=ConversationList, summary="My conversations")
def conversations(
    session: DatabaseSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ConversationList:
    return ConversationList(data=service.list_conversations(session, user, limit=limit))


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationDetail,
    summary="Messages in a conversation",
)
def conversation(
    conversation_id: UUID, session: DatabaseSession, user: CurrentUser
) -> ConversationDetail:
    return service.conversation_detail(session, user, conversation_id)


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationSummary,
    summary="Rename a conversation",
)
def rename(
    conversation_id: UUID, payload: ConversationRename, session: DatabaseSession, user: CurrentUser
) -> ConversationSummary:
    return service.rename_conversation(session, user, conversation_id, payload.title)


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a conversation",
)
def delete(conversation_id: UUID, session: DatabaseSession, user: CurrentUser) -> None:
    service.delete_conversation(session, user, conversation_id)


@router.delete(
    "/conversations", status_code=status.HTTP_204_NO_CONTENT, summary="Clear my chat history"
)
def clear(session: DatabaseSession, user: CurrentUser) -> None:
    service.clear_conversations(session, user)
