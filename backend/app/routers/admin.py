from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.draft_session import DraftSession
from app.models.free_character import FreeCharacter
from app.models.season import Season
from app.models.user import User
from app.schemas.session import SeasonCreate, FreeCharAssign, SessionOut
from app.services.auth_service import require_admin

router = APIRouter()


@router.get("/sessions", response_model=list[SessionOut])
def list_active_sessions(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin: list all sessions not yet complete."""
    return (
        db.query(DraftSession)
        .filter(DraftSession.status != "complete")
        .order_by(DraftSession.created_at.desc())
        .all()
    )


@router.post("/seasons", status_code=status.HTTP_201_CREATED)
def create_season(
    body: SeasonCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin: create a new season. Deactivates the current active season."""
    # Deactivate any current active season
    db.query(Season).filter(Season.is_active == True).update({"is_active": False})  # noqa: E712
    season = Season(name=body.name, is_active=True)
    db.add(season)
    db.commit()
    db.refresh(season)
    return {"id": season.id, "name": season.name, "is_active": season.is_active}


@router.get("/seasons/active")
def get_active_season(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin: get the current active season and its free characters."""
    season = db.query(Season).filter(Season.is_active == True).first()  # noqa: E712
    if not season:
        raise HTTPException(status_code=404, detail="No active season found.")
    free = [
        {"id": fc.id, "character_id": fc.character_id, "character_name": fc.character.name}
        for fc in season.free_characters
    ]
    return {"id": season.id, "name": season.name, "free_characters": free}


@router.post("/seasons/{season_id}/free-characters", status_code=status.HTTP_201_CREATED)
def assign_free_characters(
    season_id: int,
    body: FreeCharAssign,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin: assign free characters to a season (replaces existing assignments)."""
    season = db.query(Season).filter(Season.id == season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found.")

    # Clear existing assignments for this season
    db.query(FreeCharacter).filter(FreeCharacter.season_id == season_id).delete()

    new_entries = [
        FreeCharacter(season_id=season_id, character_id=char_id)
        for char_id in set(body.character_ids)  # deduplicate
    ]
    db.add_all(new_entries)
    db.commit()

    return {
        "season_id": season_id,
        "assigned_character_ids": [fc.character_id for fc in new_entries],
    }
