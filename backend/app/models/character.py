from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Character(Base):
    """
    Represents a Genshin Impact character available in the draft pool.
    Stores only identity data (name + image) — no stats needed.
    """

    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    icon_url: Mapped[str] = mapped_column(String(500), nullable=False)
    splash_art_url: Mapped[str] = mapped_column(String(500), nullable=False)

    def __repr__(self) -> str:
        return f"<Character id={self.id} name={self.name!r}>"
