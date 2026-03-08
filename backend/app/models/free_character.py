from sqlalchemy import Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class FreeCharacter(Base):
    """
    Junction table: defines which characters are 'Free' within a specific season.
    Admins can assign 1+ free characters per season.
    Players may use one free swap per session during the Team Building phase.
    """

    __tablename__ = "free_characters"
    __table_args__ = (
        # A character can only appear once per season in the free pool
        UniqueConstraint("season_id", "character_id", name="uq_free_char_season"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    season_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    character_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Relationships for convenient ORM access
    season = relationship("Season", backref="free_characters")
    character = relationship("Character", backref="free_character_entries")

    def __repr__(self) -> str:
        return f"<FreeCharacter season_id={self.season_id} character_id={self.character_id}>"
