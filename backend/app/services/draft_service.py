"""
draft_service.py — Draft State Machine

Full 20-slot sequence across 4 phases for Genshin Spiral Abyss (8 chars per player):

  Phase 1 — First Ban   (slots  1-2  )   A→B          (2 bans)
  Phase 2 — First Pick  (slots  3-10 )   A-BB-AA-BB-A (8 picks)
  Phase 3 — Second Ban  (slots 11-12 )   A→B          (2 bans)
  Phase 4 — Second Pick (slots 13-20 )   B-AA-BB-AA-B (8 picks, reversed)

"first"  → first_pick_player
"second" → the other player

After slot 20: status transitions to "team_building"
"""

from typing import Optional
from sqlalchemy.orm import Session

from app.models.draft_session import DraftSession
from app.models.draft_action import DraftAction


# ── Draft Template ────────────────────────────────────────────────────────────

DRAFT_TEMPLATE: list[tuple[int, str, str]] = [
    # Phase 1 — First Ban (2 bans: A→B)
    (1,  "ban",  "first"),
    (2,  "ban",  "second"),

    # Phase 2 — First Pick (8 picks: A-BB-AA-BB-A)
    (3,  "pick", "first"),
    (4,  "pick", "second"),
    (5,  "pick", "second"),
    (6,  "pick", "first"),
    (7,  "pick", "first"),
    (8,  "pick", "second"),
    (9,  "pick", "second"),
    (10, "pick", "first"),

    # Phase 3 — Second Ban (2 bans: A→B)
    (11, "ban",  "first"),
    (12, "ban",  "second"),

    # Phase 4 — Second Pick (8 picks: B-AA-BB-AA-B — priority reverses)
    (13, "pick", "second"),
    (14, "pick", "first"),
    (15, "pick", "first"),
    (16, "pick", "second"),
    (17, "pick", "second"),
    (18, "pick", "first"),
    (19, "pick", "first"),
    (20, "pick", "second"),
]

# Slot number → (new_status_after_this_slot, is_phase_boundary)
# Only the LAST slot of each phase triggers a status transition.
PHASE_ENDS: dict[int, str] = {
    2:  "pick_phase_1",   # last ban of Phase 1  → start first picks
    10: "ban_phase_2",    # last pick of Phase 2 → start second bans
    12: "pick_phase_2",   # last ban of Phase 3  → start second picks
    20: "team_building",  # last pick of Phase 4 → team building
}

# Status strings for each phase (used by handlers for validation)
ACTIVE_DRAFT_STATUSES = {"ban_phase_1", "pick_phase_1", "ban_phase_2", "pick_phase_2"}


def _resolve_actor(session: DraftSession, slot_role: str) -> str:
    """Translate 'first'/'second' → 'player_a'/'player_b'."""
    first = session.first_pick_player  # e.g. 'player_a'
    second = "player_b" if first == "player_a" else "player_a"
    return first if slot_role == "first" else second


def get_draft_sequence(session: DraftSession) -> list[dict]:
    """
    Full 20-slot sequence with concrete player assignments.
    Requires coin toss to be fully resolved (first_pick_player not None).
    """
    return [
        {
            "sequence_num": seq,
            "action_type": atype,
            "acting_player": _resolve_actor(session, role),
            "phase": _slot_to_phase(seq),
        }
        for seq, atype, role in DRAFT_TEMPLATE
    ]


def _slot_to_phase(seq: int) -> str:
    if seq <= 2:
        return "ban_phase_1"
    if seq <= 10:
        return "pick_phase_1"
    if seq <= 12:
        return "ban_phase_2"
    return "pick_phase_2"


def get_current_slot(session: DraftSession, db: Session) -> Optional[dict]:
    """
    Returns the next unfilled draft slot, or None if all 20 are done.
    """
    existing = {
        row.sequence_num
        for row in db.query(DraftAction.sequence_num)
        .filter(DraftAction.session_id == session.id)
        .all()
    }

    for slot in get_draft_sequence(session):
        if slot["sequence_num"] not in existing:
            return slot
    return None  # All 20 slots filled


def submit_action(
    session: DraftSession,
    acting_player: str,
    character_id: Optional[int],
    db: Session,
) -> tuple[Optional[dict], bool, Optional[str]]:
    """
    Validate and persist a single ban or pick action.

    Returns:
        (next_slot, phase_changed, new_status)
        - next_slot   : next unfilled slot dict, or None if draft complete
        - phase_changed: True if a phase boundary was just crossed
        - new_status   : the status set on session if phase_changed, else None

    Raises ValueError with a human-readable reason on validation failure.
    """
    current_slot = get_current_slot(session, db)
    if current_slot is None:
        raise ValueError("All 20 draft slots are already filled.")

    # ── Turn validation ────────────────────────────────────────────────────────
    if current_slot["acting_player"] != acting_player:
        raise ValueError(
            f"It is {current_slot['acting_player']}'s turn, not {acting_player}."
        )

    # ── Character uniqueness (Skip if null) ────────────────────────────────────
    if character_id is not None:
        already_used = (
            db.query(DraftAction)
            .filter(
                DraftAction.session_id == session.id,
                DraftAction.character_id == character_id,
            )
            .first()
        )
        if already_used:
            raise ValueError(
                "This character has already been banned or picked in this session."
            )
    else:
        # If character_id is None, it MUST be a ban action.
        if current_slot["action_type"] != "ban":
            raise ValueError("You can only skip a 'ban' action, not a 'pick'.")

    # ── Persist ────────────────────────────────────────────────────────────────
    action = DraftAction(
        session_id=session.id,
        sequence_num=current_slot["sequence_num"],
        action_type=current_slot["action_type"],
        acting_player=acting_player,
        character_id=character_id,
    )
    
    try:
        db.add(action)
        db.commit()
        db.refresh(action)

        # ── Phase transition ───────────────────────────────────────────────────────
        phase_changed = False
        new_status: Optional[str] = None
        next_slot = get_current_slot(session, db)

        if current_slot["sequence_num"] in PHASE_ENDS:
            new_status = PHASE_ENDS[current_slot["sequence_num"]]
            session.status = new_status
            db.commit()
            phase_changed = True
            
        return next_slot, phase_changed, new_status
        
    except Exception as e:
        db.rollback()
        from app.config import settings
        if getattr(settings, "PROD", False):
            print(f"[DB Error] draft_service.submit_action: {type(e).__name__}")
            raise ValueError("Database transaction failed. Please try again.")
        raise ValueError(f"Database error during submission: {e}")


def get_player_picks(session: DraftSession, player: str, db: Session) -> list[int]:
    """Returns all character_ids that `player` has successfully PICKED (across both pick phases)."""
    actions = (
        db.query(DraftAction)
        .filter(
            DraftAction.session_id == session.id,
            DraftAction.acting_player == player,
            DraftAction.action_type == "pick",
        )
        .all()
    )
    return [a.character_id for a in actions]


def get_all_bans(session: DraftSession, db: Session) -> list[int]:
    """Returns all character_ids that were banned in this session."""
    actions = (
        db.query(DraftAction)
        .filter(
            DraftAction.session_id == session.id,
            DraftAction.action_type == "ban",
        )
        .all()
    )
    return [a.character_id for a in actions]


def get_progress_summary(session: DraftSession, db: Session) -> dict:
    """Returns a human-readable progress summary for the current session."""
    existing = (
        db.query(DraftAction)
        .filter(DraftAction.session_id == session.id)
        .order_by(DraftAction.sequence_num)
        .all()
    )
    completed = len(existing)
    return {
        "completed_slots": completed,
        "total_slots": len(DRAFT_TEMPLATE),
        "current_phase": session.status,
        "next_slot": get_current_slot(session, db),
    }
