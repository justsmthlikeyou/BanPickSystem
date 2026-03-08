"""
seed.py — Genshin Pick System database seeder.

Reads characters.json and upserts all characters into the SQLite database.
Also ensures at least one active Season exists.

Usage (from backend/ with venv active):
    python seed.py                    # use default characters.json
    python seed.py --file my_chars.json

Safe to run multiple times — uses upsert logic (insert-or-update by name).
New characters are added; existing characters have their image_url updated.
"""

import argparse
import json
import sys
from pathlib import Path

# Allow running from any working directory
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy.orm import Session

from app.database import SessionLocal, engine, Base
import app.models  # noqa: F401 — ensures all models register with Base.metadata
from app.models.character import Character
from app.models.season import Season


def upsert_characters(db: Session, characters: list[dict]) -> tuple[int, int, int]:
    """
    Insert new characters or update image_url for existing ones (matched by name).

    Safety layers against duplicates:
      1. Application-level: query-then-insert/update (primary guard)
      2. Database-level: unique constraint on `name` column (final safety net)
      3. Exception-level: catches IntegrityError and rolls back gracefully

    Returns (inserted_count, updated_count, skipped_count).
    """
    from sqlalchemy.exc import IntegrityError

    inserted = 0
    updated = 0
    skipped = 0

    for entry in characters:
        name: str = entry.get("name", "").strip()
        icon_url: str = entry.get("icon_url", "").strip()
        splash_art_url: str = entry.get("splash_art_url", "").strip()

        if not name:
            print(f"  [SKIP] Entry missing 'name': {entry}")
            skipped += 1
            continue

        existing = db.query(Character).filter(Character.name == name).first()

        if existing:
            if existing.icon_url != icon_url or existing.splash_art_url != splash_art_url:
                existing.icon_url = icon_url
                existing.splash_art_url = splash_art_url
                try:
                    db.commit()
                    updated += 1
                    print(f"  [UPDATE] {name}")
                except IntegrityError:
                    db.rollback()
                    skipped += 1
                    print(f"  [SKIP]   {name} (integrity error on update)")
            else:
                skipped += 1  # no change needed — count silently
        else:
            db.add(Character(name=name, icon_url=icon_url, splash_art_url=splash_art_url))
            try:
                db.commit()
                inserted += 1
                print(f"  [INSERT] {name}")
            except IntegrityError:
                # Race condition or duplicate in JSON file — rollback and move on
                db.rollback()
                skipped += 1
                print(f"  [SKIP]   {name} (duplicate detected, skipped safely)")

    return inserted, updated, skipped


def ensure_active_season(db: Session) -> Season:
    """Create a default active Season if none exists."""
    active = db.query(Season).filter(Season.is_active == True).first()  # noqa: E712
    if active:
        print(f"  [OK] Active season: '{active.name}' (id={active.id})")
        return active

    # No active season — create one
    try:
        existing = db.query(Season).filter(Season.name == "Season 1 - Standard").first()
    except Exception:
        existing = None

    if not existing:
        season = Season(name="Season 1 - Standard", is_active=True)
        db.add(season)
        db.commit()
        db.refresh(season)
        print(f"  [CREATE] Season '{season.name}' created (id={season.id})")
        return season
    else:
        existing.is_active = True
        db.commit()
        print(f"  [UPDATE] Season '{existing.name}' activated")
        return existing


def main():
    parser = argparse.ArgumentParser(description="Seed the Genshin Pick System database.")
    parser.add_argument(
        "--file",
        default=str(Path(__file__).parent / "characters.json"),
        help="Path to the characters JSON file (default: characters.json next to this script)",
    )
    args = parser.parse_args()

    json_path = Path(args.file)
    if not json_path.exists():
        print(f"[ERROR] File not found: {json_path}")
        sys.exit(1)

    with open(json_path, encoding="utf-8") as f:
        try:
            characters = json.load(f)
        except json.JSONDecodeError as e:
            print(f"[ERROR] Invalid JSON in {json_path}: {e}")
            sys.exit(1)

    if not isinstance(characters, list):
        print("[ERROR] characters.json must be a JSON array of objects.")
        sys.exit(1)

    print("=" * 50)
    print(f"  Seeding from: {json_path.name}")
    print(f"  Characters in file: {len(characters)}")
    print("=" * 50)

    # We rely on Alembic migrations to create tables.
    # Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        print("\n[1/2] Upserting characters...")
        inserted, updated, skipped = upsert_characters(db, characters)

        print(f"\n[2/2] Ensuring active season...")
        ensure_active_season(db)
    finally:
        db.close()

    print("\n" + "=" * 50)
    print(f"  Done! {inserted} inserted, {updated} updated, {skipped} unchanged.")
    print("=" * 50)


if __name__ == "__main__":
    main()
