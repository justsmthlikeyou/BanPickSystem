import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.character import Character
from app.models.draft_action import DraftAction
from app.models.team_building_swap import TeamBuildingSwap

def clear_characters():
    db: Session = SessionLocal()
    try:
        # Before deleting characters, we must delete dependent draft actions and swaps
        # because of foreign key constraints if they aren't completely cascading
        db.query(DraftAction).delete()
        db.query(TeamBuildingSwap).delete()
        
        # Now delete all characters
        deleted = db.query(Character).delete()
        db.commit()
        print(f"[OK] Cleared {deleted} characters from the database.")
        print("[OK] Also cleared any existing draft actions/swaps to maintain referential integrity.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Failed to clear characters: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clear_characters()
