from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, sessionmaker

from app.core.net import client_ip
from app.db.session import get_db_session
from app.modules.assistant import ai, memory, service
from app.modules.assistant.schemas import (
    AssistantStatus,
    ChatRequest,
    ChatResponse,
    ConversationDetail,
    ConversationList,
    ConversationRename,
    ConversationSummary,
    MemoryIn,
    MemoryList,
    MemoryOut,
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
    caller_ip = client_ip(request)
    key = f"user:{viewer.id}" if viewer else token_digest(f"assistant:{caller_ip}")
    service.check_rate_limit(key)
    return service.chat(session, payload=payload, user=viewer)


@router.post(
    "/chat/stream",
    summary="Chat with the kitchen assistant, streaming the reply as it is written",
    response_class=StreamingResponse,
)
def chat_stream(
    payload: ChatRequest, request: Request, session: DatabaseSession, viewer: OptionalUser
) -> StreamingResponse:
    caller_ip = client_ip(request)
    key = f"user:{viewer.id}" if viewer else token_digest(f"assistant:{caller_ip}")
    service.check_rate_limit(key)
    # Chuẩn bị (kiểm tra quyền, tìm món, tìm tài liệu) trước khi mở luồng để lỗi trả về đúng mã.
    turn = service.begin_turn(session, payload=payload, user=viewer)
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False)
    return StreamingResponse(
        service.stream_turn(turn, factory),
        media_type="text/event-stream",
        # Không để proxy (nginx) gom luồng lại rồi mới gửi.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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


@router.get("/memories", response_model=MemoryList, summary="What Chef Dragon remembers about me")
def memories(session: DatabaseSession, user: CurrentUser) -> MemoryList:
    return MemoryList(
        data=[MemoryOut.model_validate(item) for item in memory.list_memories(session, user)],
        limit=memory.MAX_MEMORIES,
    )


@router.post(
    "/memories",
    response_model=MemoryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a memory",
)
def add_memory(payload: MemoryIn, session: DatabaseSession, user: CurrentUser) -> MemoryOut:
    return MemoryOut.model_validate(memory.create_memory(session, user, payload.content))


@router.patch("/memories/{memory_id}", response_model=MemoryOut, summary="Edit a memory")
def edit_memory(
    memory_id: UUID, payload: MemoryIn, session: DatabaseSession, user: CurrentUser
) -> MemoryOut:
    return MemoryOut.model_validate(memory.update_memory(session, user, memory_id, payload.content))


@router.delete(
    "/memories/{memory_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a memory"
)
def remove_memory(memory_id: UUID, session: DatabaseSession, user: CurrentUser) -> None:
    memory.delete_memory(session, user, memory_id)


@router.delete(
    "/memories", status_code=status.HTTP_204_NO_CONTENT, summary="Forget everything about me"
)
def clear_memories(session: DatabaseSession, user: CurrentUser) -> None:
    memory.clear_memories(session, user)
