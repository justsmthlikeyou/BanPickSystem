from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class DraftSession(Base):
    """
    Represents one complete Ban/Pick game session between two players.

    Status flow (enforced by DraftService):
      waiting → coin_toss → banning → picking → team_building → complete
    """

    __tablename__ = "draft_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Room Identity ─────────────────────────────────────────────────────────
    room_code: Mapped[str] = mapped_column(String(12), nullable=False, unique=True, index=True)

    # ── Participants ──────────────────────────────────────────────────────────
    player_a_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    player_b_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    admin_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # ── Season (determines Free Characters) ───────────────────────────────────
    season_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("seasons.id", ondelete="RESTRICT"), nullable=False
    )

    # ── Session State ─────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="waiting")

    # ── Ready Flags ───────────────────────────────────────────────────────────
    player_a_ready: Mapped[bool] = mapped_column(Integer, nullable=False, default=False)
    player_b_ready: Mapped[bool] = mapped_column(Integer, nullable=False, default=False)

    # ── Coin Toss Results ─────────────────────────────────────────────────────
    # 'player_a' = heads (left), 'player_b' = tails (right)
    coin_toss_winner: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Winner's chosen advantage: 'pick_order' or 'abyss_side'
    toss_winner_choice: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)

    # ── Resolved Advantages ───────────────────────────────────────────────────
    # Which player picks first (determined after coin toss resolution)
    first_pick_player: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    first_half_player: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    
    # ── Persistence (for server restarts/reconnects) ──────────────────────────
    is_paused: Mapped[bool] = mapped_column(Integer, nullable=False, default=False)
    player_a_passed: Mapped[bool] = mapped_column(Integer, nullable=False, default=False)
    player_b_passed: Mapped[bool] = mapped_column(Integer, nullable=False, default=False)

    # ── Team Configurations (stored as comma-separated IDs or JSON) ──────────
    player_a_team1: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    player_a_team2: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    player_b_team1: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    player_b_team2: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    player_a = relationship("User", foreign_keys=[player_a_id])
    player_b = relationship("User", foreign_keys=[player_b_id])
    admin = relationship("User", foreign_keys=[admin_id])
    season = relationship("Season", backref="sessions")
    draft_actions = relationship(
        "DraftAction", back_populates="session", order_by="DraftAction.sequence_num"
    )
    team_building_swaps = relationship("TeamBuildingSwap", back_populates="session")

    def __repr__(self) -> str:
        return (
            f"<DraftSession id={self.id} room_code={self.room_code!r} status={self.status!r}>"
        )
