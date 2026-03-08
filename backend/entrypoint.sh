#!/bin/bash

# --- Genshin Pick System Render Entrypoint ---
# This script applies migrations, seeds the database, and starts the server.

set -e  # Exit on error

echo "Running [1/3] Database Migrations..."
alembic upgrade head

echo "Running [2/3] Seeding Character Data..."
# Ensure we use python instead of python3 if that's the environment default
python seed.py

echo "Running [3/3] Starting Server..."
# Use host 0.0.0.0 and dynamic port from Render
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
