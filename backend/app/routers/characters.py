from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.character import Character
from app.models.user import User
from app.schemas.character import CharacterOut
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get("/", response_model=list[CharacterOut])
def list_characters(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return all characters available in the draft pool."""
    return db.query(Character).order_by(Character.name).all()
