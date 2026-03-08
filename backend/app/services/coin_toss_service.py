import random
from typing import Literal
from sqlalchemy.orm import Session

from app.models.draft_session import DraftSession


CoinResult = Literal["heads", "tails"]
Player = Literal["player_a", "player_b"]
Privilege = Literal["pick_order", "abyss_side"]
SubChoice = Literal["first", "second", "first_half", "second_half"]


def flip() -> CoinResult:
    """Flip a fair coin. Returns 'heads' (player_a wins) or 'tails' (player_b wins)."""
    return random.choice(["heads", "tails"])


def determine_winner(toss_result: CoinResult) -> Player:
    """
    Maps coin result to winning player.
      heads → player_a (Left Team)
      tails → player_b (Right Team)
    """
    return "player_a" if toss_result == "heads" else "player_b"


def get_loser(winner: Player) -> Player:
    return "player_b" if winner == "player_a" else "player_a"


def resolve_winner_choice(
    session: DraftSession,
    winner: Player,
    privilege: Privilege,
    sub_choice: SubChoice,
    db: Session,
) -> None:
    """
    Apply the winner's privilege selection to the session.

    If privilege == 'pick_order':
      sub_choice must be 'first' or 'second'
      → sets session.first_pick_player

    If privilege == 'abyss_side':
      sub_choice must be 'first_half' or 'second_half'
      → sets session.first_half_player
    """
    loser: Player = get_loser(winner)

    session.coin_toss_winner = winner
    session.toss_winner_choice = privilege

    if privilege == "pick_order":
        if sub_choice == "first":
            session.first_pick_player = winner
        elif sub_choice == "second":
            session.first_pick_player = loser
    elif privilege == "abyss_side":
        if sub_choice == "first_half":
            session.first_half_player = winner
        elif sub_choice == "second_half":
            session.first_half_player = loser

    try:
        db.commit()
        db.refresh(session)
    except Exception as e:
        db.rollback()
        from app.config import settings
        if getattr(settings, "PROD", False):
            print(f"[DB Error] coin_toss_service.resolve_winner_choice: {type(e).__name__}")
            raise ValueError("Database transaction failed.")
        raise ValueError(f"Database error during toss resolve: {e}")


def resolve_loser_choice(
    session: DraftSession,
    loser: Player,
    sub_choice: SubChoice,
    db: Session,
) -> None:
    """
    Apply the loser's privilege selection to the session.

    The loser receives whichever privilege the winner did NOT choose.
    If winner chose 'pick_order'  → loser gets 'abyss_side'  → sub_choice: 'first_half' | 'second_half'
    If winner chose 'abyss_side'  → loser gets 'pick_order'  → sub_choice: 'first' | 'second'
    """
    winner: Player = get_loser(loser)  # loser's loser = winner

    if session.toss_winner_choice == "pick_order":
        # Loser chooses abyss_side
        if sub_choice == "first_half":
            session.first_half_player = loser
        elif sub_choice == "second_half":
            session.first_half_player = winner
    elif session.toss_winner_choice == "abyss_side":
        # Loser chooses pick_order
        if sub_choice == "first":
            session.first_pick_player = loser
        elif sub_choice == "second":
            session.first_pick_player = winner

    try:
        db.commit()
        db.refresh(session)
    except Exception as e:
        db.rollback()
        from app.config import settings
        if getattr(settings, "PROD", False):
            print(f"[DB Error] coin_toss_service.resolve_loser_choice: {type(e).__name__}")
            raise ValueError("Database transaction failed.")
        raise ValueError(f"Database error during toss resolve: {e}")


def both_choices_resolved(session: DraftSession) -> bool:
    """Returns True when both pick order AND abyss side have been decided."""
    return session.first_pick_player is not None and session.first_half_player is not None
