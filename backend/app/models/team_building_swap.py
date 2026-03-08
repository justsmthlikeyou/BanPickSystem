from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class TeamBuildingSwap(Base):
    """
    Records the optional Free Character swap each player may make ONCE per session
    during the Team Building phase.

    Constraint enforced at the database level:
      - (session_id, player) UNIQUE → each player can only swap once per session.

    player:          'player_a' or 'player_b'
    original_char_id: the drafted character being swapped OUT
    free_char_id:     the Free Character being swapped IN
    """

    __tablename__ = "team_building_swaps"
    __table_args__ = (
        # Each player is allowed exactly one swap per session
        UniqueConstraint("session_id", "player", name="uq_swap_player_session"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("draft_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player: Mapped[str] = mapped_column(String(10), nullable=False)  # 'player_a' | 'player_b'
    original_char_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("characters.id", ondelete="RESTRICT"), nullable=False
    )
    free_char_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("characters.id", ondelete="RESTRICT"), nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    session = relationship("DraftSession", back_populates="team_building_swaps")
    original_character = relationship("Character", foreign_keys=[original_char_id])
    free_character = relationship("Character", foreign_keys=[free_char_id])

    def __repr__(self) -> str:
        return (
            f"<TeamBuildingSwap player={self.player!r} "
            f"out={self.original_char_id} in={self.free_char_id}>"
        )
