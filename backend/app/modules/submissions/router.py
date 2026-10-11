from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.submissions.models import RecipeSubmission
from app.modules.submissions.schemas import (
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionWrite,
)

router = APIRouter(prefix="/submissions")

DatabaseSession = Annotated[Session, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


class SubmissionNotFoundError(DomainError):
    code = "SUBMISSION_NOT_FOUND"
    status_code = status.HTTP_404_NOT_FOUND


class SubmissionLockedError(DomainError):
    code = "SUBMISSION_LOCKED"
    status_code = status.HTTP_409_CONFLICT


def _owned_submission(session: Session, user: User, submission_id: UUID) -> RecipeSubmission:
    submission = session.scalar(
        select(RecipeSubmission).where(
            RecipeSubmission.id == submission_id, RecipeSubmission.user_id == user.id
        )
    )
    if submission is None:
        raise SubmissionNotFoundError("Không tìm thấy đề xuất món.")
    return submission


def _apply(submission: RecipeSubmission, payload: SubmissionWrite) -> None:
    submission.name = payload.name
    submission.region = payload.region
    submission.category = payload.category
    submission.servings = payload.servings
    submission.total_minutes = payload.total_minutes
    submission.story = payload.story
    submission.ingredients = payload.ingredients
    submission.steps = payload.steps
    submission.status = "pending" if payload.submit else "draft"


@router.get("/mine", response_model=SubmissionListResponse, summary="List my recipe suggestions")
def my_submissions(session: DatabaseSession, current_user: CurrentUser) -> SubmissionListResponse:
    items = list(
        session.scalars(
            select(RecipeSubmission)
            .where(RecipeSubmission.user_id == current_user.id)
            .order_by(RecipeSubmission.updated_at.desc())
        )
    )
    return SubmissionListResponse(
        data=[SubmissionResponse.model_validate(item) for item in items], total=len(items)
    )


@router.post(
    "",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Suggest a new recipe",
)
def create_submission(
    payload: SubmissionWrite, session: DatabaseSession, current_user: CurrentUser
) -> SubmissionResponse:
    submission = RecipeSubmission(user_id=current_user.id)
    _apply(submission, payload)
    session.add(submission)
    session.commit()
    session.refresh(submission)
    return SubmissionResponse.model_validate(submission)


@router.put("/{submission_id}", response_model=SubmissionResponse, summary="Edit my suggestion")
def update_submission(
    submission_id: UUID,
    payload: SubmissionWrite,
    session: DatabaseSession,
    current_user: CurrentUser,
) -> SubmissionResponse:
    submission = _owned_submission(session, current_user, submission_id)
    if submission.status == "approved":
        raise SubmissionLockedError("Đề xuất đã được duyệt nên không thể chỉnh sửa.")
    _apply(submission, payload)
    submission.admin_note = None
    session.commit()
    session.refresh(submission)
    return SubmissionResponse.model_validate(submission)


@router.delete(
    "/{submission_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete my suggestion"
)
def delete_submission(
    submission_id: UUID, session: DatabaseSession, current_user: CurrentUser
) -> None:
    submission = _owned_submission(session, current_user, submission_id)
    session.delete(submission)
    session.commit()
