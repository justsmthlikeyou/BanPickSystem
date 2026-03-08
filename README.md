# Genshin Impact Draft System

A real-time, competitive Ban/Pick application for Genshin Impact, inspired by League of Legends draft phases. Designed for tournament play with integrated Abyss side choice and First Pick mechanics. 

## Features

- **Real-Time Synchronization**: Built on FastAPI WebSockets and Zustand, providing sub-second state updates across all clients instantly.
- **Tournament Draft Format**: 20-slot draft phase encompassing two ban phrases and two pick phases per player.
- **Coin Toss mechanic**: Fair selection of First-Pick order or Spiral Abyss side.
- **Skip Ban Functionality**: Built-in support to intentionally skip a ban turn with seamless spectator synchronization. 
- **High-Speed CDN Assets**: Character splash arts and icons are fetched automatically from `nanoka.cc` for rapid rendering.
- **Instant Search Bar**: Filter out the roster of 80+ Genshin characters via an integrated fast-search input.
- **Spectator / Admin View**: Powerful tools for tournament organizers to dictate phases, pause drafts, and resolve issues.

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** & **npm**
- **SQLite** (bundled with Python)

## Installation Guide

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd GenshinPickSystem
```

### 2. Backend Setup
Create your virtual environment, install dependencies, and run the database migrations and seed script.

```bash
cd backend
python -m venv venv

# Activate the virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Setup the environment variables
cp .env.example .env
# Edit .env and set your SECRET_KEY, APP_ENV, and PROD flag.

# Run database migrations
alembic upgrade head

# Seed the initial character database
python seed.py
```

### 3. Frontend Setup
```bash
cd ../frontend

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local to point VITE_API_URL and VITE_WS_URL to the backend.
```

## Running the Application

### Development Mode
To run the server and client concurrently in development, open two terminals.

**Terminal 1 (Backend):**
```bash
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

### Production Mode
1. Ensure `.env` in the backend has `PROD=True` and `APP_ENV=production`.
2. Ensure Frontend's `.env.local` accurately points to your production deployment URLs.
3. Build the frontend:
   ```bash
   cd frontend
   npm run build
   ```
4. Serve the contents of `frontend/dist` using Nginx/Apache or similar.
### Deployment (Render / Linux)

For production deployment on platforms like Render, we use a Linux shell script to automate the setup.

1.  **Configure Environment**: Set your backend environment variables (`SECRET_KEY`, `PROD=True`, `ALLOWED_ORIGINS`).
2.  **Persistent Disk (CRITICAL)**: Because SQLite uses a local file, Render's default ephemeral disk will clear your database on every restart. 
    -   In the Render Dashboard, go to **Disks**.
    -   Create a disk (e.g., `draft-db`, 1GB).
    -   Mount it to `/opt/render/project/src/backend/data`.
    -   Update your `.env` to use: `DATABASE_URL=sqlite:////opt/render/project/src/backend/data/genshin_draft.db`.
3.  **Start Command**: Use `./entrypoint.sh` as the Start Command. This script automatically runs migrations, seeds data if needed, and starts the server.

## License
MIT License

