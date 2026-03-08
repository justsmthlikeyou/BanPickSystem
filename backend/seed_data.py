"""
seed_data.py
━━━━━━━━━━━━
Populates the `characters` table and creates an initial active Season.
Run this ONCE after `alembic upgrade head`.

Usage (from backend/ directory, with venv active):
    python seed_data.py
"""

import sys
from pathlib import Path

# Ensure backend/ is on sys.path when running directly
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal, engine, Base
from app.models import Character, Season

# ── Character Data ─────────────────────────────────────────────────────────────
# Images use the official Genshin Impact Fandom wiki as a stable source.
# Replace image_url values with your own hosted assets if preferred.

CHARACTERS = [
    # Pyro
    {"name": "Hu Tao",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/0/09/Character_Hu_Tao_Thumb.png"},
    {"name": "Yoimiya",        "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/3/35/Character_Yoimiya_Thumb.png"},
    {"name": "Lyney",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/b/b7/Character_Lyney_Thumb.png"},
    {"name": "Arlecchino",     "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/9/91/Character_Arlecchino_Thumb.png"},
    {"name": "Diluc",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/6/69/Character_Diluc_Thumb.png"},
    {"name": "Xiangling",      "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/3/35/Character_Xiangling_Thumb.png"},
    # Hydro
    {"name": "Neuvillette",    "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/4/44/Character_Neuvillette_Thumb.png"},
    {"name": "Furina",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/0/0d/Character_Furina_Thumb.png"},
    {"name": "Yelan",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/9/96/Character_Yelan_Thumb.png"},
    {"name": "Xingqiu",        "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/4/42/Character_Xingqiu_Thumb.png"},
    {"name": "Tartaglia",      "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/d/db/Character_Tartaglia_Thumb.png"},
    {"name": "Ayato",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/b/b5/Character_Kamisato_Ayato_Thumb.png"},
    # Cryo
    {"name": "Ayaka",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/2/28/Character_Kamisato_Ayaka_Thumb.png"},
    {"name": "Ganyu",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/5/51/Character_Ganyu_Thumb.png"},
    {"name": "Wriothesley",    "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/f/f4/Character_Wriothesley_Thumb.png"},
    {"name": "Shenhe",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/d/d5/Character_Shenhe_Thumb.png"},
    {"name": "Eula",           "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/0/04/Character_Eula_Thumb.png"},
    {"name": "Layla",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/0/01/Character_Layla_Thumb.png"},
    # Electro
    {"name": "Raiden Shogun",  "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/c/c8/Character_Raiden_Shogun_Thumb.png"},
    {"name": "Yae Miko",       "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/4/4a/Character_Yae_Miko_Thumb.png"},
    {"name": "Cyno",           "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/f/ff/Character_Cyno_Thumb.png"},
    {"name": "Fischl",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/c/c0/Character_Fischl_Thumb.png"},
    {"name": "Beidou",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/4/49/Character_Beidou_Thumb.png"},
    {"name": "Keqing",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/8/8b/Character_Keqing_Thumb.png"},
    # Anemo
    {"name": "Kazuha",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/c/ca/Character_Kaedehara_Kazuha_Thumb.png"},
    {"name": "Venti",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/e/e0/Character_Venti_Thumb.png"},
    {"name": "Xiao",           "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/d/db/Character_Xiao_Thumb.png"},
    {"name": "Jean",           "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/8/8a/Character_Jean_Thumb.png"},
    {"name": "Wanderer",       "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/4/42/Character_Wanderer_Thumb.png"},
    {"name": "Lynette",        "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/3/31/Character_Lynette_Thumb.png"},
    # Geo
    {"name": "Zhongli",        "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/8/8e/Character_Zhongli_Thumb.png"},
    {"name": "Albedo",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/4/49/Character_Albedo_Thumb.png"},
    {"name": "Itto",           "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/8/85/Character_Arataki_Itto_Thumb.png"},
    {"name": "Navia",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/3/39/Character_Navia_Thumb.png"},
    {"name": "Noelle",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/a/ae/Character_Noelle_Thumb.png"},
    # Dendro
    {"name": "Nahida",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/5/52/Character_Nahida_Thumb.png"},
    {"name": "Baizhu",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/6/6c/Character_Baizhu_Thumb.png"},
    {"name": "Tighnari",       "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/e/e1/Character_Tighnari_Thumb.png"},
    {"name": "Alhaitham",      "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/e/e8/Character_Alhaitham_Thumb.png"},
    {"name": "Kaveh",          "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/5/58/Character_Kaveh_Thumb.png"},
    {"name": "Collei",         "image_url": "https://static.wikia.nocookie.net/gensin-impact/images/c/ce/Character_Collei_Thumb.png"},
]

INITIAL_SEASON = {"name": "Season 1 - Launch", "is_active": True}


def seed():
    print("=" * 55)
    print("  Genshin Pick System — Database Seeder")
    print("=" * 55)

    db = SessionLocal()
    try:
        # ── Seed Characters ────────────────────────────────────────────────
        existing_names = {c.name for c in db.query(Character).all()}
        new_chars = [
            Character(name=c["name"], image_url=c["image_url"])
            for c in CHARACTERS
            if c["name"] not in existing_names
        ]

        if new_chars:
            db.add_all(new_chars)
            db.commit()
            print(f"  ✓ Inserted {len(new_chars)} new character(s).")
        else:
            print("  — Characters already seeded, skipping.")

        total = db.query(Character).count()
        print(f"  ✓ Total characters in DB: {total}")

        # ── Seed Initial Season ────────────────────────────────────────────
        existing_season = db.query(Season).filter_by(name=INITIAL_SEASON["name"]).first()
        if not existing_season:
            season = Season(**INITIAL_SEASON)
            db.add(season)
            db.commit()
            print(f"  ✓ Created season: '{INITIAL_SEASON['name']}' (active)")
        else:
            print(f"  — Season '{INITIAL_SEASON['name']}' already exists, skipping.")

        print("=" * 55)
        print("  Seeding complete! ✅")
        print("=" * 55)

    except Exception as e:
        db.rollback()
        print(f"\n  ❌ Seeding failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
