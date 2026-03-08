"""
WebSocket endpoint — /ws/{room_code}?token=<JWT>&role=<player_a|player_b|admin>

IMPORTANT: ws.accept() MUST be called BEFORE any ws.close() or ws.send_json().
This handler accepts first, validates second, and closes gracefully on failures.

Inbound events (Client → Server):
    PLAYER_READY_UP       { is_ready: bool }
    TOSS_WINNER_PICK      { privilege: 'pick_order'|'abyss_side', sub_choice: 'first'|'second'|'first_half'|'second_half' }
    TOSS_LOSER_PICK       { sub_choice: 'first'|'second'|'first_half'|'second_half' }
    SUBMIT_DRAFT_ACTION   { character_id: int }
    SUBMIT_FREE_SWAP      { original_char_id: int, free_char_id: int }
    PLAYER_PASS_SWAP      {}

Outbound events (Server → All in room):
    SESSION_STATE, PLAYER_READY, COIN_TOSS_RESULT, WINNER_CHOSE, LOSER_CHOSE,
    PHASE_CHANGED, DRAFT_ACTION, FREE_SWAP_MADE, PLAYER_PASSED_SWAP,
    SESSION_COMPLETE, ERROR
"""

from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError
from jose import jwt as jose_jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.draft_action import DraftAction
from app.models.draft_session import DraftSession
from app.models.team_building_swap import TeamBuildingSwap
from app.services import coin_toss_service, draft_service, free_char_service
from app.services.draft_service import ACTIVE_DRAFT_STATUSES
from app.websockets.manager import manager

router = APIRouter()

ALGORITHM = "HS256"

# ── In-memory pass tracking ───────────────────────────────────────────────────
_swap_passes: dict[int, set[str]] = defaultdict(set)

# ── In-memory pause state ─────────────────────────────────────────────────────
_paused_rooms: set[str] = set()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _decode_token(token: str) -> Optional[dict]:
    """Returns payload dict or None if token is invalid."""
    try:
        return jose_jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def _build_snapshot(session: DraftSession, db: Session) -> dict:
    """Build a serializable dict of the full session state."""
    db.refresh(session)

    actions = db.query(DraftAction).filter(
        DraftAction.session_id == session.id
    ).order_by(DraftAction.sequence_num).all()

    swaps = db.query(TeamBuildingSwap).filter(
        TeamBuildingSwap.session_id == session.id
    ).all()

    return {
        "id": session.id,
        "room_code": session.room_code,
        "status": session.status,
        "player_a_id": session.player_a_id,
        "player_b_id": session.player_b_id,
        "player_a_ready": session.player_a_ready,
        "player_b_ready": session.player_b_ready,
        "coin_toss_winner": session.coin_toss_winner,
        "toss_winner_choice": session.toss_winner_choice,
        "first_pick_player": session.first_pick_player,
        "first_half_player": session.first_half_player,
        "draft_actions": [
            {
                "sequence_num": a.sequence_num,
                "action_type": a.action_type,
                "acting_player": a.acting_player,
                "character_id": a.character_id,
            }
            for a in actions
        ],
        "team_building_swaps": [
            {
                "player": s.player,
                "original_char_id": s.original_char_id,
                "free_char_id": s.free_char_id,
            }
            for s in swaps
        ],
    }


async def _err(ws: WebSocket, message: str):
    await ws.send_json({"event": "ERROR", "payload": {"message": message}})


# ── WebSocket Endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/{room_code}")
async def websocket_endpoint(
    ws: WebSocket,
    room_code: str,
    token: str = Query(...),
    role: str = Query(...),
):
    # ── Step 1: Accept FIRST (required before any send/close) ────────────────
    await ws.accept()
    db = SessionLocal()

    try:
        # ── Step 2: Token validation ──────────────────────────────────────────
        payload = _decode_token(token)
        if payload is None:
            await _err(ws, "Invalid or expired token.")
            await ws.close(code=1008)
            return

        user_id: int = int(payload.get("sub", 0))
        user_role: str = payload.get("role", "")

        # ── Step 3: Role validation ───────────────────────────────────────────
        allowed_roles = {"player_a", "player_b", "admin"}
        if role not in allowed_roles:
            await _err(ws, f"Invalid role '{role}'. Must be player_a, player_b, or admin.")
            await ws.close(code=1008)
            return

        if role in ("player_a", "player_b") and user_role != "player":
            await _err(ws, "Only players can connect as player_a / player_b.")
            await ws.close(code=1008)
            return

        if role == "admin" and user_role != "admin":
            await _err(ws, "Admin token required for admin role.")
            await ws.close(code=1008)
            return

        # ── Step 4: Session lookup ────────────────────────────────────────────
        session: Optional[DraftSession] = (
            db.query(DraftSession).filter(DraftSession.room_code == room_code).first()
        )
        if session is None:
            await _err(ws, f"Session '{room_code}' not found.")
            await ws.close(code=1008)
            return

        # ── Step 5: Register connection & send initial state ──────────────────
        manager.register(ws, room_code, role)

        await ws.send_json({
            "event": "SESSION_STATE",
            "payload": _build_snapshot(session, db),
        })

        # ── Step 6: Main message loop ─────────────────────────────────────────
        while True:
            data = await ws.receive_json()
            try:
                event: str = data.get("event", "")
                ep: dict = data.get("payload", {})

                if event == "PING":
                    await ws.send_json({"event": "PONG"})
                    continue

                if event == "SYNC_STATE":
                    await ws.send_json({
                        "event": "SESSION_STATE",
                        "payload": _build_snapshot(session, db)
                    })
                    continue

                # Always refresh session state from DB
                db.refresh(session)

                # ── PLAYER_READY_UP ───────────────────────────────────────────────
                if event == "PLAYER_READY_UP":
                    if session.status != "waiting":
                        await _err(ws, "Session is not in waiting state.")
                        continue
                    if role not in ("player_a", "player_b"):
                        await _err(ws, "Only players can ready up.")
                        continue

                    is_ready: bool = bool(ep.get("is_ready", True))
                    if role == "player_a":
                        session.player_a_ready = is_ready
                    else:
                        session.player_b_ready = is_ready

                    db.commit()
                    db.refresh(session)

                    await manager.broadcast_to_room(room_code, {
                        "event": "PLAYER_READY",
                        "payload": {"player": role, "is_ready": is_ready},
                    })

                # ── TOSS_WINNER_PICK ──────────────────────────────────────────────
                elif event == "TOSS_WINNER_PICK":
                    if session.status != "coin_toss":
                        await _err(ws, "Not in coin_toss phase.")
                        continue
                    if role != session.coin_toss_winner:
                        await _err(ws, "Only the coin toss winner can make this choice.")
                        continue

                    privilege: str = ep.get("privilege", "")
                    sub_choice: str = ep.get("sub_choice", "")

                    valid_privileges = {"pick_order", "abyss_side"}
                    valid_sub = {"pick_order": {"first", "second"}, "abyss_side": {"first_half", "second_half"}}

                    if privilege not in valid_privileges:
                        await _err(ws, "privilege must be 'pick_order' or 'abyss_side'.")
                        continue
                    if sub_choice not in valid_sub[privilege]:
                        await _err(ws, f"sub_choice for {privilege} must be one of {valid_sub[privilege]}.")
                        continue

                    coin_toss_service.resolve_winner_choice(session, role, privilege, sub_choice, db)
                    db.refresh(session)

                    loser = coin_toss_service.get_loser(role)
                    loser_privilege = "abyss_side" if privilege == "pick_order" else "pick_order"

                    await manager.broadcast_to_room(room_code, {
                        "event": "WINNER_CHOSE",
                        "payload": {
                            "winner": role,
                            "privilege": privilege,
                            "sub_choice": sub_choice,
                            "loser": loser,
                            "loser_privilege": loser_privilege,
                        },
                    })

                    if coin_toss_service.both_choices_resolved(session):
                        session.status = "ban_phase_1"
                        db.commit()
                        await manager.broadcast_to_room(room_code, {
                            "event": "START_MATCH_SYNC",
                            "payload": _build_snapshot(session, db),
                        })

                # ── TOSS_LOSER_PICK ───────────────────────────────────────────────
                elif event == "TOSS_LOSER_PICK":
                    if session.status != "coin_toss":
                        await _err(ws, "Not in coin_toss phase.")
                        continue

                    winner = session.coin_toss_winner
                    loser = coin_toss_service.get_loser(winner)

                    if role != loser:
                        await _err(ws, "Only the coin toss loser can make this choice.")
                        continue
                    if session.toss_winner_choice is None:
                        await _err(ws, "Wait for the winner to choose first.")
                        continue

                    loser_privilege = "abyss_side" if session.toss_winner_choice == "pick_order" else "pick_order"
                    valid_sub = {"pick_order": {"first", "second"}, "abyss_side": {"first_half", "second_half"}}
                    sub_choice: str = ep.get("sub_choice", "")

                    if sub_choice not in valid_sub[loser_privilege]:
                        await _err(ws, f"sub_choice for {loser_privilege} must be one of {valid_sub[loser_privilege]}.")
                        continue

                    coin_toss_service.resolve_loser_choice(session, loser, sub_choice, db)
                    db.refresh(session)

                    await manager.broadcast_to_room(room_code, {
                        "event": "LOSER_CHOSE",
                        "payload": {
                            "loser": loser,
                            "loser_privilege": loser_privilege,
                            "sub_choice": sub_choice,
                        },
                    })

                    if coin_toss_service.both_choices_resolved(session):
                        session.status = "ban_phase_1"
                        db.commit()
                        await manager.broadcast_to_room(room_code, {
                            "event": "START_MATCH_SYNC",
                            "payload": _build_snapshot(session, db),
                        })

                # ── SUBMIT_DRAFT_ACTION ───────────────────────────────────────────
                elif event == "SUBMIT_DRAFT_ACTION":
                    if room_code in _paused_rooms:
                        await _err(ws, "Draft is paused by admin.")
                        continue
                    if session.status not in ACTIVE_DRAFT_STATUSES:
                        await _err(ws, f"Draft is not active (current status: {session.status}).")
                        continue

                    character_id = ep.get("character_id")

                    current_slot_for_type = draft_service.get_current_slot(session, db)
                    if not current_slot_for_type or current_slot_for_type["acting_player"] != role:
                        await _err(ws, "SYNC_ERROR")
                        continue

                    action_type = current_slot_for_type["action_type"] if current_slot_for_type else "pick"
                    
                    if character_id is None and action_type != "ban":
                        await _err(ws, "character_id is required for a pick.")
                        continue

                    try:
                        next_slot, phase_changed, new_status = draft_service.submit_action(
                            session, role, character_id, db
                        )
                    except ValueError as e:
                        await _err(ws, str(e))
                        continue

                    db.refresh(session)

                    await manager.broadcast_to_room(room_code, {
                        "event": "DRAFT_ACTION",
                        "payload": {
                            "acting_player": role,
                            "character_id": character_id,
                            "next_slot": next_slot,
                            "current_status": session.status,
                            "action_type": action_type,
                        },
                    })

                    # Always sync full state after any valid action
                    await manager.broadcast_to_room(room_code, {
                        "event": "SESSION_STATE",
                        "payload": _build_snapshot(session, db),
                    })

                    if phase_changed:
                        await manager.broadcast_to_room(room_code, {
                            "event": "PHASE_CHANGED",
                            "payload": {"new_status": new_status, "next_slot": next_slot},
                        })

                # ── SUBMIT_FREE_SWAP ──────────────────────────────────────────────
                elif event == "SUBMIT_FREE_SWAP":
                    if session.status != "team_building":
                        await _err(ws, "Not in team_building phase.")
                        continue

                    original_char_id = ep.get("original_char_id")
                    free_char_id = ep.get("free_char_id")

                    if not original_char_id or not free_char_id:
                        await _err(ws, "original_char_id and free_char_id are required.")
                        continue

                    try:
                        free_char_service.submit_swap(session, role, original_char_id, free_char_id, db)
                    except ValueError as e:
                        await _err(ws, str(e))
                        continue

                    await manager.broadcast_to_room(room_code, {
                        "event": "FREE_SWAP_MADE",
                        "payload": {
                            "player": role,
                            "original_char_id": original_char_id,
                            "free_char_id": free_char_id,
                        },
                    })

                    passed = _swap_passes.get(session.id, set())
                    if free_char_service.check_phase_complete(session, passed, db):
                        session.status = "complete"
                        db.commit()
                        final = free_char_service.get_final_teams(session, passed, db)
                        await manager.broadcast_to_room(room_code, {
                            "event": "SESSION_COMPLETE",
                            "payload": {"final_teams": final},
                        })

                # ── PLAYER_PASS_SWAP ──────────────────────────────────────────────
                elif event == "PLAYER_PASS_SWAP":
                    if session.status != "team_building":
                        await _err(ws, "Not in team_building phase.")
                        continue
                    if role not in ("player_a", "player_b"):
                        continue

                    _swap_passes[session.id].add(role)

                    await manager.broadcast_to_room(room_code, {
                        "event": "PLAYER_PASSED_SWAP",
                        "payload": {"player": role},
                    })

                    passed = _swap_passes[session.id]
                    if free_char_service.check_phase_complete(session, passed, db):
                        session.status = "complete"
                        db.commit()
                        final = free_char_service.get_final_teams(session, passed, db)
                        await manager.broadcast_to_room(room_code, {
                            "event": "SESSION_COMPLETE",
                            "payload": {"final_teams": final},
                        })

                # ── HOVER_PREVIEW (any client → broadcast to room) ────────────────
                elif event == "HOVER_PREVIEW":
                    if role in ("player_a", "player_b"):
                        current_slot = draft_service.get_current_slot(session, db)
                        if not current_slot or current_slot["acting_player"] != role:
                            await _err(ws, "SYNC_ERROR")
                            continue

                    # Relay hover state to all clients (including admin/spectator)
                    await manager.broadcast_to_room(room_code, {
                        "event": "HOVER_PREVIEW",
                        "payload": {
                            "player": role,
                            "character_id": ep.get("character_id"),
                        },
                    })

                # ── SELECT_PREVIEW (any client → broadcast to room) ───────────────
                elif event == "SELECT_PREVIEW":
                    if role in ("player_a", "player_b"):
                        current_slot = draft_service.get_current_slot(session, db)
                        if not current_slot or current_slot["acting_player"] != role:
                            await _err(ws, "SYNC_ERROR")
                            continue

                    # Relay click state to all clients
                    await manager.broadcast_to_room(room_code, {
                        "event": "SELECT_PREVIEW",
                        "payload": {
                            "player": role,
                            "character_id": ep.get("character_id"),
                        },
                    })

                # ── PING / HEARTBEAT ──────────────────────────────────────────────
                elif event == "PING":
                    # Simply keeping the connection alive; optional PONG reply
                    await ws.send_json({"event": "PONG"})
                    continue

                # ── SYNC_STATE ────────────────────────────────────────────────────
                elif event == "SYNC_STATE":
                    await ws.send_json({
                        "event": "SESSION_STATE",
                        "payload": _build_snapshot(session, db),
                    })
                    continue

                # ── ADMIN_START_DRAFT ────────────────────────────────────────────
                elif event == "ADMIN_START_DRAFT":
                    if role != "admin":
                        await _err(ws, "Only admins can start the draft.")
                        continue
                    if session.status != "coin_toss":
                        await _err(ws, "Draft can only be started from coin_toss phase.")
                        continue

                    # If manual choice wasn't made, auto-resolve: Winner picks first
                    if session.coin_toss_winner and session.toss_winner_choice is None:
                        winner = session.coin_toss_winner
                        loser = coin_toss_service.get_loser(winner)
                        
                        session.toss_winner_choice = "pick_order"
                        session.first_pick_player = winner
                        session.first_half_player = loser

                    session.status = "ban_phase_1"
                    db.commit()

                    await manager.broadcast_to_room(room_code, {
                        "event": "START_MATCH_SYNC",
                        "payload": _build_snapshot(session, db),
                    })

                # ── ADMIN_START_MATCH ────────────────────────────────────────────
                elif event == "ADMIN_START_MATCH":
                    if role != "admin":
                        await _err(ws, "Only admins can start the match.")
                        continue

                    # Idempotent: if coin already flipped, just re-send the result
                    if session.coin_toss_winner:
                        loser = coin_toss_service.get_loser(session.coin_toss_winner)
                        await ws.send_json({
                            "event": "COIN_TOSS_RESULT",
                            "payload": {
                                "result": "already_decided",
                                "winner": session.coin_toss_winner,
                                "loser": loser,
                            },
                        })
                        continue

                    if not (session.player_a_ready and session.player_b_ready):
                        await _err(ws, "Both players must be ready before starting.")
                        continue

                    toss_result = coin_toss_service.flip()
                    winner = coin_toss_service.determine_winner(toss_result)
                    loser = coin_toss_service.get_loser(winner)
                    session.coin_toss_winner = winner
                    session.status = "coin_toss"
                    db.commit()

                    await manager.broadcast_to_room(room_code, {
                        "event": "COIN_TOSS_RESULT",
                        "payload": {
                            "result": toss_result,
                            "winner": winner,
                            "loser": loser,
                        },
                    })

                # ── ADMIN_PAUSE ──────────────────────────────────────────────────
                elif event == "ADMIN_PAUSE":
                    if role != "admin":
                        await _err(ws, "Only admins can pause.")
                        continue
                    _paused_rooms.add(room_code)
                    await manager.broadcast_to_room(room_code, {
                        "event": "ADMIN_PAUSE",
                        "payload": {"paused": True},
                    })

                # ── ADMIN_RESUME ─────────────────────────────────────────────────
                elif event == "ADMIN_RESUME":
                    if role != "admin":
                        await _err(ws, "Only admins can resume.")
                        continue
                    _paused_rooms.discard(room_code)
                    await manager.broadcast_to_room(room_code, {
                        "event": "ADMIN_RESUME",
                        "payload": {"paused": False},
                    })

                # ── ADMIN_FORCE_CONFIRM ──────────────────────────────────────────
                elif event == "ADMIN_FORCE_CONFIRM":
                    if role != "admin":
                        await _err(ws, "Only admins can force confirm.")
                        continue
                    if session.status not in ACTIVE_DRAFT_STATUSES:
                        await _err(ws, f"Draft is not active (current status: {session.status}).")
                        continue

                    character_id = ep.get("character_id")
                    if not character_id:
                        await _err(ws, "character_id is required for force confirm.")
                        continue

                    current_slot = draft_service.get_current_slot(session, db)
                    if current_slot is None:
                        await _err(ws, "All slots are filled.")
                        continue

                    acting_player = current_slot["acting_player"]
                    action_type = current_slot["action_type"]
                    try:
                        next_slot, phase_changed, new_status = draft_service.submit_action(
                            session, acting_player, character_id, db
                        )
                    except ValueError as e:
                        await _err(ws, str(e))
                        continue

                    db.refresh(session)

                    await manager.broadcast_to_room(room_code, {
                        "event": "DRAFT_ACTION",
                        "payload": {
                            "acting_player": acting_player,
                            "character_id": character_id,
                            "next_slot": next_slot,
                            "current_status": session.status,
                            "forced_by_admin": True,
                            "action_type": action_type,
                        },
                    })

                    if phase_changed:
                        await manager.broadcast_to_room(room_code, {
                            "event": "PHASE_CHANGED",
                            "payload": {"new_status": new_status, "next_slot": next_slot},
                        })

                # ── ADMIN_RESET_DRAFT ────────────────────────────────────────────
                elif event == "ADMIN_RESET_DRAFT":
                    if getattr(settings, "PROD", False):
                        await _err(ws, "Draft reset is disabled in production.")
                        continue
                        
                    if role != "admin":
                        await _err(ws, "Only admins can reset the draft.")
                        continue

                    # Delete all draft actions for this session
                    db.query(DraftAction).filter(DraftAction.session_id == session.id).delete()
                    db.query(TeamBuildingSwap).filter(TeamBuildingSwap.session_id == session.id).delete()

                    # Reset session state
                    session.status = "waiting"
                    session.player_a_ready = False
                    session.player_b_ready = False
                    session.coin_toss_winner = None
                    session.toss_winner_choice = None
                    session.first_pick_player = None
                    session.first_half_player = None
                    db.commit()

                    # Clear in-memory state
                    _swap_passes.pop(session.id, None)
                    _paused_rooms.discard(room_code)

                    # Send fresh snapshot to everyone
                    await manager.broadcast_to_room(room_code, {
                        "event": "SESSION_STATE",
                        "payload": _build_snapshot(session, db),
                    })

                else:
                    await _err(ws, f"Unknown event: '{event}'")

            except Exception as e:
                import traceback
                if not getattr(settings, "PROD", False):
                    traceback.print_exc()
                    await _err(ws, f"Handler error: {e}")
                else:
                    print(f"[WS] Error in room {room_code}: {type(e).__name__} - {e}")
                    await _err(ws, "An internal server error occurred.")

    except WebSocketDisconnect:
        pass  # Client disconnected normally
    except Exception as e:
        # Attempt to notify client of unexpected error
        try:
            msg = f"Server error: {type(e).__name__}" if getattr(settings, "PROD", False) else f"Server error: {e}"
            await ws.send_json({"event": "ERROR", "payload": {"message": msg}})
        except Exception:
            pass
    finally:
        # Always clean up connection and DB session
        manager.disconnect(ws, room_code, role)
        db.close()
