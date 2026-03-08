# Project Architecture: Genshin Impact Ban/Pick Draft System

## 1. Overview

A real-time web application inspired by League of Legends tournament drafts, tailored for Genshin Impact. Two players engage in a structured Ban/Pick phase, mediated by a coin-toss system, culminating in a team-building phase with a "Free Character" swap mechanic. Admins can spectate all live sessions simultaneously.

---

## 2. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐│
│  │  Player A UI │   │  Player B UI │   │  Admin / Commentator UI  ││
│  │  (Browser)   │   │  (Browser)   │   │  (Browser - Dashboard)   ││
│  └──────┬───────┘   └──────┬───────┘   └───────────┬──────────────┘│
│         │  HTTP + WS       │  HTTP + WS             │ HTTP + WS     │
└─────────┼──────────────────┼────────────────────────┼───────────────┘
          │                  │                        │
┌─────────▼──────────────────▼────────────────────────▼───────────────┐
│                        BACKEND LAYER  (FastAPI / Python)            │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │   REST API       │  │  WebSocket Hub   │  │  Auth Service   │   │
│  │  /api/v1/...     │  │  /ws/{room_id}   │  │  JWT Tokens     │   │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │               Core Game Logic Services                       │   │
│  │  CoinTossService │ DraftService │ FreeCharService │ RoomMgr  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                       DATA LAYER                                    │
│                    SQLite Database (via SQLAlchemy)                 │
│  Users │ Characters │ Sessions │ DraftStates │ FreeCharacters       │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Choices

| Layer        | Technology               | Rationale                                              |
|--------------|--------------------------|--------------------------------------------------------|
| Backend      | **Python / FastAPI**     | Async-native, WebSocket support, fast dev cycle        |
| ORM          | **SQLAlchemy 2.x**       | Clean model definitions, migration-ready               |
| Database     | **SQLite**               | Zero-config, file-based, sufficient for this scale     |
| Real-time    | **WebSockets (native)**  | Full-duplex; built into FastAPI/Starlette               |
| Auth         | **JWT (python-jose)**    | Stateless, role-embedded tokens                        |
| Frontend     | **Vanilla HTML/CSS/JS**  | No build toolchain required; can migrate to React later|
| Migrations   | **Alembic**              | Schema versioning for SQLite                           |

---

## 3. Recommended Folder Structure

```
GenshinPickSystem/
├── venv/                        ← Python virtual environment (DO NOT COMMIT)
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              ← FastAPI app entry point, router mounts
│   │   ├── config.py            ← Settings (secret key, db path, etc.)
│   │   ├── database.py          ← SQLAlchemy engine & session factory
│   │   │
│   │   ├── models/              ← SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── character.py
│   │   │   ├── session.py
│   │   │   ├── draft_action.py
│   │   │   └── free_character.py
│   │   │
│   │   ├── schemas/             ← Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── character.py
│   │   │   ├── session.py
│   │   │   └── draft.py
│   │   │
│   │   ├── routers/             ← FastAPI APIRouters (REST endpoints)
│   │   │   ├── __init__.py
│   │   │   ├── auth.py          ← /api/v1/auth/...
│   │   │   ├── characters.py    ← /api/v1/characters/...
│   │   │   ├── sessions.py      ← /api/v1/sessions/...
│   │   │   └── admin.py         ← /api/v1/admin/...
│   │   │
│   │   ├── websockets/
│   │   │   ├── __init__.py
│   │   │   ├── manager.py       ← ConnectionManager: room-based broadcast
│   │   │   └── handlers.py      ← WS message routing & event processing
│   │   │
│   │   └── services/            ← Business logic (no DB or HTTP coupling)
│   │       ├── __init__.py
│   │       ├── auth_service.py
│   │       ├── coin_toss_service.py
│   │       ├── draft_service.py
│   │       └── free_char_service.py
│   │
│   ├── migrations/              ← Alembic migration scripts
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │
│   ├── alembic.ini
│   ├── seed_data.py             ← Script to seed character data
│   └── requirements.txt
│
├── frontend/
│   ├── index.html               ← Landing / Login page
│   ├── lobby.html               ← Pre-draft lobby (ready-up, coin toss)
│   ├── draft.html               ← Main Ban/Pick interface
│   ├── team_building.html       ← Post-draft team building & free swap
│   ├── admin.html               ← Admin dashboard (spectator view)
│   │
│   ├── css/
│   │   ├── base.css             ← CSS reset, variables, typography
│   │   ├── components.css
│   │   └── animations.css
│   │
│   └── js/
│       ├── api.js               ← REST API call wrappers
│       ├── websocket.js         ← WS client & event dispatcher
│       ├── auth.js              ← Token management (localStorage)
│       ├── draft.js             ← Draft UI logic
│       ├── lobby.js             ← Lobby / coin toss UI
│       └── admin.js             ← Admin dashboard multi-view logic
│
├── .gitignore
├── project_architecture.md      ← This file
└── README.md
```

---

## 4. Database Schema (SQLite – Fully Normalized)

### Entity-Relationship Overview

```
Users ──< Sessions (as player_a / player_b / admin)
Sessions ──< DraftActions
Sessions ──< TeamBuildingSwaps
Characters ──< DraftActions
Characters ──< FreeCharacters (season junction)
```

---

### Table: `users`

| Column       | Type         | Constraints                              | Description                         |
|--------------|--------------|------------------------------------------|-------------------------------------|
| `id`         | INTEGER      | PRIMARY KEY AUTOINCREMENT                | Unique user identifier              |
| `username`   | TEXT         | NOT NULL, UNIQUE                         | Display name / login handle         |
| `password_hash` | TEXT      | NOT NULL                                 | bcrypt-hashed password              |
| `role`       | TEXT         | NOT NULL, DEFAULT `'player'`             | `'player'` or `'admin'`             |
| `created_at` | DATETIME     | NOT NULL, DEFAULT CURRENT_TIMESTAMP      | Account creation timestamp          |

---

### Table: `characters`

| Column      | Type    | Constraints               | Description                    |
|-------------|---------|---------------------------|--------------------------------|
| `id`        | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique character identifier    |
| `name`      | TEXT    | NOT NULL, UNIQUE           | Character name (e.g., "Hu Tao")|
| `image_url` | TEXT    | NOT NULL                  | URL to character portrait asset |

---

### Table: `seasons`

> Isolates "Free Character" configurations across events/seasons.

| Column       | Type     | Constraints                         | Description               |
|--------------|----------|-------------------------------------|---------------------------|
| `id`         | INTEGER  | PRIMARY KEY AUTOINCREMENT           | Unique season identifier  |
| `name`       | TEXT     | NOT NULL, UNIQUE                    | Season label (e.g. "v5.4")|
| `is_active`  | INTEGER  | NOT NULL, DEFAULT `1` (BOOLEAN)     | Only one active at a time  |
| `created_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Creation timestamp         |

---

### Table: `free_characters`

> Junction table: which characters are "Free" in a given season (many-to-many).

| Column         | Type    | Constraints                               | Description                  |
|----------------|---------|-------------------------------------------|------------------------------|
| `id`           | INTEGER | PRIMARY KEY AUTOINCREMENT                 | Row identifier               |
| `season_id`    | INTEGER | NOT NULL, FOREIGN KEY → `seasons(id)`     | Associated season            |
| `character_id` | INTEGER | NOT NULL, FOREIGN KEY → `characters(id)`  | The free character           |
|                |         | UNIQUE (`season_id`, `character_id`)       | No duplicate entries         |

---

### Table: `draft_sessions`

> One row per Ban/Pick game session.

| Column              | Type     | Constraints                                     | Description                              |
|---------------------|----------|-------------------------------------------------|------------------------------------------|
| `id`                | INTEGER  | PRIMARY KEY AUTOINCREMENT                       | Session identifier                       |
| `room_code`         | TEXT     | NOT NULL, UNIQUE                                | Short shareable room code                |
| `player_a_id`       | INTEGER  | NOT NULL, FOREIGN KEY → `users(id)`             | Left team player                         |
| `player_b_id`       | INTEGER  | FOREIGN KEY → `users(id)`                       | Right team player (joins later)          |
| `admin_id`          | INTEGER  | FOREIGN KEY → `users(id)`                       | Presiding admin/commentator              |
| `season_id`         | INTEGER  | NOT NULL, FOREIGN KEY → `seasons(id)`           | Season (determines free chars)           |
| `status`            | TEXT     | NOT NULL, DEFAULT `'waiting'`                   | `waiting` → `coin_toss` → `banning` → `picking` → `team_building` → `complete` |
| `coin_toss_winner`  | TEXT     | NULL                                            | `'player_a'` or `'player_b'`            |
| `toss_winner_choice`| TEXT     | NULL                                            | `'pick_order'` or `'abyss_side'`        |
| `first_pick_player` | TEXT     | NULL                                            | `'player_a'` or `'player_b'`            |
| `first_half_player` | TEXT     | NULL                                            | `'player_a'` or `'player_b'`            |
| `created_at`        | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP             | Session creation timestamp               |
| `updated_at`        | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP             | Last state change timestamp              |

> **Status Flow:**
> `waiting` → `coin_toss` → `banning` → `picking` → `team_building` → `complete`

---

### Table: `draft_actions`

> Immutable log of every single Ban and Pick action taken during a session.

| Column         | Type     | Constraints                                      | Description                                      |
|----------------|----------|--------------------------------------------------|--------------------------------------------------|
| `id`           | INTEGER  | PRIMARY KEY AUTOINCREMENT                        | Action row identifier                            |
| `session_id`   | INTEGER  | NOT NULL, FOREIGN KEY → `draft_sessions(id)`     | Parent session                                   |
| `sequence_num` | INTEGER  | NOT NULL                                         | Action order (1–8), enforces draft order         |
| `action_type`  | TEXT     | NOT NULL                                         | `'ban'` or `'pick'`                              |
| `acting_player`| TEXT     | NOT NULL                                         | `'player_a'` or `'player_b'`                     |
| `character_id` | INTEGER  | NOT NULL, FOREIGN KEY → `characters(id)`         | The chosen character                             |
| `timestamp`    | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP              | When the action was logged                       |
|                |          | UNIQUE (`session_id`, `sequence_num`)            | Prevents duplicate sequence slots               |
|                |          | UNIQUE (`session_id`, `character_id`)            | A character can only be used once per session    |

---

### Table: `team_building_swaps`

> Records the optional Free Character swap each player may make once.

| Column                | Type     | Constraints                                     | Description                              |
|-----------------------|----------|-------------------------------------------------|------------------------------------------|
| `id`                  | INTEGER  | PRIMARY KEY AUTOINCREMENT                       | Row identifier                           |
| `session_id`          | INTEGER  | NOT NULL, FOREIGN KEY → `draft_sessions(id)`    | Parent session                           |
| `player`              | TEXT     | NOT NULL                                        | `'player_a'` or `'player_b'`             |
| `original_char_id`    | INTEGER  | NOT NULL, FOREIGN KEY → `characters(id)`        | Character being swapped out              |
| `free_char_id`        | INTEGER  | NOT NULL, FOREIGN KEY → `characters(id)`        | The Free Character being swapped in      |
| `timestamp`           | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP             | When the swap was recorded               |
|                       |          | UNIQUE (`session_id`, `player`)                 | Each player can only swap once per session|

---

### Relationship Summary

```
users (1) ──────< (many) draft_sessions   [as player_a, player_b, or admin]
seasons (1) ────< (many) draft_sessions
seasons (1) ────< (many) free_characters >──── (1) characters
draft_sessions (1) ──< (many) draft_actions >─ (1) characters
draft_sessions (1) ──< (many) team_building_swaps
```

---

## 5. WebSocket Event Protocol

All WebSocket messages follow a simple JSON envelope:

```json
{
  "event": "<EVENT_TYPE>",
  "payload": { ... }
}
```

### Key Events (Server → Client)

| Event                  | Payload                                              | Description                              |
|------------------------|------------------------------------------------------|------------------------------------------|
| `SESSION_STATE`        | Full session snapshot                                | Sent on connect/reconnect                |
| `PLAYER_READY`         | `{ player, is_ready }`                               | A player toggled ready                   |
| `COIN_TOSS_RESULT`     | `{ winner, result }`                                 | Heads/tails revealed                     |
| `WINNER_CHOSE`         | `{ player, choice, outcome }`                        | Toss winner made their choice            |
| `DRAFT_ACTION`         | `{ sequence_num, action_type, player, character_id }`| A ban/pick was recorded                  |
| `PHASE_CHANGED`        | `{ new_status, current_turn }`                       | Session moved to next phase              |
| `FREE_SWAP_MADE`       | `{ player, original_char_id, free_char_id }`         | A team-building swap was used            |
| `SESSION_COMPLETE`     | `{ final_teams }`                                    | Draft fully concluded                    |

### Key Events (Client → Server)

| Event                  | Payload                                              | Description                              |
|------------------------|------------------------------------------------------|------------------------------------------|
| `PLAYER_READY_UP`      | `{ is_ready }`                                       | Player signals ready                     |
| `TOSS_WINNER_PICK`     | `{ choice }` (`pick_order` or `abyss_side`)          | Winner selects their advantage           |
| `SUBMIT_DRAFT_ACTION`  | `{ action_type, character_id }`                      | Submit a ban or pick                     |
| `SUBMIT_FREE_SWAP`     | `{ original_char_id, free_char_id }`                 | Use the free swap privilege              |

---

## 6. Draft Sequence (8 Characters Total)

The exact ban/pick order is configurable in `DraftService`, but the **default** follows a balanced format:

```
Phase 1 – BANNING (4 total bans)
  Slot 1:  Ban  – First Pick Player   (determined by coin toss)
  Slot 2:  Ban  – Second Pick Player
  Slot 3:  Ban  – First Pick Player
  Slot 4:  Ban  – Second Pick Player

Phase 2 – PICKING (4 total picks)
  Slot 5:  Pick – First Pick Player
  Slot 6:  Pick – Second Pick Player
  Slot 7:  Pick – Second Pick Player
  Slot 8:  Pick – First Pick Player
```

> Result: Each player bans 2 characters and picks 2 characters (4 banned, 4 picked = 8 total).

---

## 7. Coin Toss & Advantage System

```
1. Both players mark "Ready" → Server triggers coin toss
2. Server calls CoinTossService.flip() → returns 'heads' or 'tails'
   - "Heads" = player_a (Left Team) wins
   - "Tails" = player_b (Right Team) wins
3. Winner is presented two choices:
   (A) "Pick Order"  → Choose first_pick or give it to opponent
   (B) "Abyss Side"  → Choose first_half or second_half of Spiral Abyss
4. The option NOT chosen by the winner is assigned to the loser
5. DraftService resolves both attributes (first_pick_player, first_half_player)
   from the winner's single choice + random default for the other attribute.
```

---

## 8. Authentication & Authorization

- **Login**: `POST /api/v1/auth/login` → Returns JWT access token
- **Registration**: `POST /api/v1/auth/register` → Creates a `player` account
- **Token Payload**: `{ sub: user_id, role: "player"|"admin", exp: ... }`
- **Role Guards**:
  - `player` routes: draft actions, lobby, team building
  - `admin` routes: create sessions, set free characters, manage seasons, spectate all

---

## 9. Development Roadmap

### Phase 0 – Project Bootstrap
- [ ] Create and activate Python `venv`
- [ ] Install all dependencies from `requirements.txt`
- [ ] Initialize Alembic, create initial migration
- [ ] Run migrations → create SQLite database
- [ ] Seed characters via `seed_data.py`

### Phase 1 – Auth & Core API
- [ ] Implement `users` model + auth service (bcrypt password, JWT)
- [ ] `POST /auth/register`, `POST /auth/login` endpoints
- [ ] JWT middleware / dependency injection for protected routes
- [ ] `GET /characters` endpoint (list all characters with images)

### Phase 2 – Session & Room Management
- [ ] Implement `draft_sessions` model and `sessions` router
- [ ] `POST /sessions` → create room (admin only)
- [ ] `POST /sessions/{room_code}/join` → player joins
- [ ] `GET /sessions/{room_code}` → get full session state
- [ ] `GET /admin/sessions` → list all active sessions (admin only)

### Phase 3 – WebSocket Hub
- [ ] Implement `ConnectionManager` (register/unregister clients per room)
- [ ] Implement WS endpoint `/ws/{room_code}?token=...`
- [ ] Broadcast `SESSION_STATE` on connect
- [ ] Handle `PLAYER_READY_UP` events, broadcast `PLAYER_READY`

### Phase 4 – Coin Toss Logic
- [ ] Implement `CoinTossService.flip()`
- [ ] On both-players-ready: trigger toss, broadcast `COIN_TOSS_RESULT`
- [ ] Handle `TOSS_WINNER_PICK`, broadcast `WINNER_CHOSE`
- [ ] Transition session status → `banning`, broadcast `PHASE_CHANGED`

### Phase 5 – Draft Engine
- [ ] Implement `DraftService`: sequence enforcement, turn validation
- [ ] Handle `SUBMIT_DRAFT_ACTION`, validate turn/character availability
- [ ] Persist `draft_actions` rows, broadcast `DRAFT_ACTION`
- [ ] Auto-transition banning → picking → team_building at correct slots

### Phase 6 – Team Building & Free Swap
- [ ] Implement `FreeCharService`: determine available free chars (from active season)
- [ ] Handle `SUBMIT_FREE_SWAP`, validate one-swap-per-player rule
- [ ] Persist `team_building_swaps`, broadcast `FREE_SWAP_MADE`
- [ ] On both players done (or both pass): broadcast `SESSION_COMPLETE`

### Phase 7 – Admin Features
- [ ] `POST /admin/seasons` → create season
- [ ] `POST /admin/seasons/{id}/free-characters` → assign free chars
- [ ] Admin dashboard: WebSocket connection to ALL active rooms simultaneously

### Phase 8 – Frontend Implementation
- [ ] Login page → stores JWT in localStorage
- [ ] Lobby page: ready-up buttons, animated coin toss reveal
- [ ] Draft page: character grid, ban/pick UI, turn timer (optional)
- [ ] Team Building page: drafted team display, free swap selection
- [ ] Admin dashboard: tiled live view of all active sessions

### Phase 9 – Polish & Testing
- [ ] Unit tests for `CoinTossService`, `DraftService`, `FreeCharService`
- [ ] Integration tests for WebSocket event flows
- [ ] Frontend responsive design, dark theme, smooth animations
- [ ] Error handling (disconnects, invalid actions, duplicate actions)
