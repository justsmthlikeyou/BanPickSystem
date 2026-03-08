from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# ── Import models so SQLAlchemy/Alembic can detect them ───────────────────────
import app.models  # noqa: F401

# ── Routers ───────────────────────────────────────────────────────────────────
from app.routers import auth, characters, sessions, admin

# ── WebSocket endpoint ────────────────────────────────────────────────────────
from app.websockets.handlers import router as ws_router

app = FastAPI(
    title="Genshin Impact Ban/Pick System",
    description="Real-time character draft system for Genshin Impact competitive play.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.APP_ENV == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── REST routers ──────────────────────────────────────────────────────────────
app.include_router(auth.router,       prefix="/api/v1/auth",       tags=["Auth"])
app.include_router(characters.router, prefix="/api/v1/characters", tags=["Characters"])
app.include_router(sessions.router,   prefix="/api/v1/sessions",   tags=["Sessions"])
app.include_router(admin.router,      prefix="/api/v1/admin",       tags=["Admin"])

# ── WebSocket ─────────────────────────────────────────────────────────────────
app.include_router(ws_router, tags=["WebSocket"])


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "app": "Genshin Pick System", "env": settings.APP_ENV}
