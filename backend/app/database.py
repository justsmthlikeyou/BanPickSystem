from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import settings

# ─── Engine ───────────────────────────────────────────────────────────────────
# check_same_thread=False is required for SQLite when used with FastAPI's
# async request handling (multiple threads may share the same connection).
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=(settings.APP_ENV == "development"),  # Log SQL in dev mode
)

# ─── Session Factory ──────────────────────────────────────────────────────────
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)

# ─── Base Class ───────────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    """All ORM models inherit from this base class."""
    pass


# ─── Dependency ───────────────────────────────────────────────────────────────
def get_db():
    """
    FastAPI dependency that yields a database session per request and
    guarantees it is properly closed after the request completes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
