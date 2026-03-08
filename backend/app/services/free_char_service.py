from sqlalchemy.orm import Session

from app.models.character import Character
from app.models.draft_session import DraftSession
from app.models.free_character import FreeCharacter
from app.models.team_building_swap import TeamBuildingSwap
from app.services import draft_service


def get_free_characters(session: DraftSession, db: Session) -> list[Character]:
    """Returns all Characters marked as Free for the session's active season."""
    free_entries = (
        db.query(FreeCharacter)
        .filter(FreeCharacter.season_id == session.season_id)
        .all()
    )
    return [entry.character for entry in free_entries]


def submit_swap(
    session: DraftSession,
    player: str,
    original_char_id: int,
    free_char_id: int,
    db: Session,
) -> TeamBuildingSwap:
    """
    Validate and persist a player's Free Character swap.

    Validation rules:
      1. `original_char_id` must be one of the player's picked characters.
      2. `free_char_id` must be in the season's free character pool.
      3. Player must not have already used their swap (DB unique constraint + pre-check).

    Returns the created TeamBuildingSwap row.
    Raises ValueError with a human-readable reason on failure.
    """
    # Rule 1 — original char must be in the player's picks
    player_picks = draft_service.get_player_picks(session, player, db)
    if original_char_id not in player_picks:
        raise ValueError(
            f"Character {original_char_id} is not in {player}'s drafted team."
        )

    # Rule 2 — free char must be in the season pool
    free_chars = get_free_characters(session, db)
    free_char_ids = {c.id for c in free_chars}
    if free_char_id not in free_char_ids:
        raise ValueError(
            f"Character {free_char_id} is not a Free Character for this season."
        )

    # Rule 3 — player hasn't already swapped
    existing_swap = db.query(TeamBuildingSwap).filter(
        TeamBuildingSwap.session_id == session.id,
        TeamBuildingSwap.player == player,
    ).first()
    if existing_swap:
        raise ValueError(f"{player} has already used their free swap.")

    swap = TeamBuildingSwap(
        session_id=session.id,
        player=player,
        original_char_id=original_char_id,
        free_char_id=free_char_id,
    )
    try:
        db.add(swap)
        db.commit()
        db.refresh(swap)
        return swap
    except Exception as e:
        db.rollback()
        from app.config import settings
        if getattr(settings, "PROD", False):
            print(f"[DB Error] free_char_service.submit_swap: {type(e).__name__}")
            raise ValueError("Database transaction failed. Please try again.")
        raise ValueError(f"Database error during swap: {e}")


def record_pass(session: DraftSession, player: str, db: Session) -> None:
    """A player passes their swap privilege. Persists to DB."""
    if player == "player_a":
        session.player_a_passed = True
    elif player == "player_b":
        session.player_b_passed = True
    db.commit()
    db.refresh(session)


def check_phase_complete(
    session: DraftSession,
    db: Session,
) -> bool:
    """Returns True if both players have either swapped OR passed."""
    swapped = {
        row.player
        for row in db.query(TeamBuildingSwap)
        .filter(TeamBuildingSwap.session_id == session.id)
        .all()
    }
    a_done = ("player_a" in swapped) or session.player_a_passed
    b_done = ("player_b" in swapped) or session.player_b_passed
    return a_done and b_done


def get_final_teams(session: DraftSession, db: Session) -> dict:
    """
    Compute each player's final roster after any swaps.
    Returns:
      {
        "player_a": [char_id, ...],   # final 2 picks (after swap if made)
        "player_b": [char_id, ...],
        "banned":   [char_id, ...],   # 4 bans
      }
    """
    from app.models.draft_action import DraftAction

    actions = (
        db.query(DraftAction)
        .filter(DraftAction.session_id == session.id)
        .all()
    )
    picks_a = [a.character_id for a in actions if a.acting_player == "player_a" and a.action_type == "pick"]
    picks_b = [a.character_id for a in actions if a.acting_player == "player_b" and a.action_type == "pick"]
    banned  = [a.character_id for a in actions if a.action_type == "ban"]

    # Apply swaps
    swaps = (
        db.query(TeamBuildingSwap)
        .filter(TeamBuildingSwap.session_id == session.id)
        .all()
    )
    for swap in swaps:
        if swap.player == "player_a" and swap.original_char_id in picks_a:
            picks_a = [swap.free_char_id if c == swap.original_char_id else c for c in picks_a]
        elif swap.player == "player_b" and swap.original_char_id in picks_b:
            picks_b = [swap.free_char_id if c == swap.original_char_id else c for c in picks_b]

    return {"player_a": picks_a, "player_b": picks_b, "banned": banned}
