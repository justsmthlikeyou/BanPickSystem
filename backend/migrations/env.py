"""
Alembic environment configuration.

This file is run by Alembic when generating or applying migrations.
It dynamically loads the SQLAlchemy URL from our app's Settings class
so we maintain a single source of truth — the .env file.
"""

import sys
from pathlib import Path
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ── Make backend/ importable ──────────────────────────────────────────────────
# Alembic runs from within the migrations/ folder; we need backend/ on sys.path
# so that `from app.xxx import ...` works correctly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ── Load app config & models ──────────────────────────────────────────────────
from app.config import settings
from app.database import Base

# Import ALL models so Alembic's autogenerate can detect them
from app.models import (  # noqa: F401
    User,
    Character,
    Season,
    FreeCharacter,
    DraftSession,
    DraftAction,
    TeamBuildingSwap,
)

# ── Alembic Config ────────────────────────────────────────────────────────────
config = context.config

# Override the sqlalchemy.url with the value from our .env file
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Set up logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ── Offline Migration (generates SQL without a live DB connection) ─────────────
def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # Required for SQLite ALTER TABLE support
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online Migration (applies migrations against a live DB connection) ─────────
def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # Required for SQLite ALTER TABLE support
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
