import random
import string
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.draft_session import DraftSession
from app.models.user import User
from app.schemas.session import SessionCreate, SessionOut
from app.services.auth_service import get_current_user, require_admin

router = APIRouter()


def _generate_room_code(length: int = 8) -> str:
    """Generate a short alphanumeric room code (e.g. 'X4KP92AZ')."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


@router.post("/", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    body: SessionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin only: create a new draft room. player_a_id is optional."""
    # If player_a_id is provided, validate that they exist and are a player
    if body.player_a_id is not None:
        player_a = db.query(User).filter(User.id == body.player_a_id, User.role == "player").first()
        if not player_a:
            raise HTTPException(status_code=404, detail="player_a not found or is not a player.")

    # Generate unique room code
    for _ in range(10):
        code = _generate_room_code()
        if not db.query(DraftSession).filter(DraftSession.room_code == code).first():
            break

    session = DraftSession(
        room_code=code,
        player_a_id=body.player_a_id,  # May be None — players join later
        admin_id=admin.id,
        season_id=body.season_id,
        status="waiting",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/{room_code}", response_model=SessionOut)
def get_session(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the full state snapshot of a session by room code."""
    session = db.query(DraftSession).filter(DraftSession.room_code == room_code).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session


@router.post("/{room_code}/join", response_model=SessionOut)
def join_session(
    room_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Player joins a waiting session. Fills player_a first, then player_b."""
    if current_user.role != "player":
        raise HTTPException(status_code=403, detail="Only players can join sessions.")

    session = db.query(DraftSession).filter(DraftSession.room_code == room_code).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.status != "waiting":
        raise HTTPException(status_code=409, detail="Session is no longer in waiting state.")

    # Already in the session?
    if session.player_a_id == current_user.id or session.player_b_id == current_user.id:
        return session  # Idempotent — just return current state

    # Fill first empty slot
    if session.player_a_id is None:
        session.player_a_id = current_user.id
    elif session.player_b_id is None:
        session.player_b_id = current_user.id
    else:
        raise HTTPException(status_code=409, detail="Session already has two players.")

    db.commit()
    db.refresh(session)
    return session

@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin: force-delete a draft session and all related records (cascaded)."""
    session = db.query(DraftSession).filter(DraftSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    db.delete(session)
    db.commit()
