from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class DraftAction(Base):
    """
    Immutable log of every Ban and Pick action taken during a draft session.

    Constraints enforced at the database level:
      - (session_id, sequence_num) UNIQUE → no two actions can occupy the same slot
      - (session_id, character_id) UNIQUE → a character can only be used once per session

    acting_player:  'player_a' or 'player_b'
    action_type:    'ban'      or 'pick'
    sequence_num:   1 through 8 (4 bans, then 4 picks)
    """

    __tablename__ = "draft_actions"
    __table_args__ = (
        UniqueConstraint("session_id", "sequence_num", name="uq_action_sequence"),
        UniqueConstraint("session_id", "character_id", name="uq_action_character"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("draft_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence_num: Mapped[int] = mapped_column(Integer, nullable=False)
    action_type: Mapped[str] = mapped_column(String(10), nullable=False)   # 'ban' | 'pick'
    acting_player: Mapped[str] = mapped_column(String(10), nullable=False) # 'player_a' | 'player_b'
    character_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("characters.id", ondelete="RESTRICT"), nullable=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    session = relationship("DraftSession", back_populates="draft_actions")
    character = relationship("Character", backref="draft_action_entries")

    def __repr__(self) -> str:
        return (
            f"<DraftAction seq={self.sequence_num} type={self.action_type!r} "
            f"player={self.acting_player!r} char={self.character_id}>"
        )
