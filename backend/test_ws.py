"""
test_ws.py — Full 20-slot draft flow smoke test (4 phases + swap).

Run from backend/ with venv active (server must be running on port 8000):
    python test_ws.py

Simulates: ready-up → coin toss → winner/loser picks → 20 draft slots → both pass → SESSION_COMPLETE
"""
import sys
import json
import asyncio
import urllib.request
import urllib.error

BASE_HTTP = "http://localhost:8000"
BASE_WS   = "ws://localhost:8000"

try:
    import websockets
except ImportError:
    print("Install websockets: pip install websockets")
    sys.exit(1)


def http_post(path, body, token=None):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE_HTTP}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def http_get(path, token=None):
    req = urllib.request.Request(f"{BASE_HTTP}{path}")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as r:
        return r.status, json.loads(r.read())


async def send(ws, event, payload=None):
    msg = {"event": event, "payload": payload or {}}
    await ws.send(json.dumps(msg))


async def recv_until(ws, target_event, timeout=8.0, max_msgs=10):
    """Receive messages until we get one with target_event (or hit limit)."""
    for _ in range(max_msgs):
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            msg = json.loads(raw)
            if msg.get("event") == target_event:
                return msg
        except asyncio.TimeoutError:
            break
    return None


async def run_test():
    print("=" * 60)
    print("  WebSocket 20-slot Draft Flow — Smoke Test")
    print("=" * 60)

    # ── Setup ────────────────────────────────────────────────────────────────
    for u, r in [("ws2_pa","player"),("ws2_pb","player"),("ws2_adm","admin")]:
        http_post("/api/v1/auth/register", {"username": u, "password": "pass123", "role": r})

    _, ta = http_post("/api/v1/auth/login", {"username": "ws2_pa",  "password": "pass123"})
    _, tb = http_post("/api/v1/auth/login", {"username": "ws2_pb",  "password": "pass123"})
    _, tad = http_post("/api/v1/auth/login", {"username": "ws2_adm", "password": "pass123"})
    token_a, token_b, token_adm = ta["access_token"], tb["access_token"], tad["access_token"]

    _, me_a = http_get("/api/v1/auth/me", token_a)
    _, season = http_get("/api/v1/admin/seasons/active", token_adm)

    status, sess = http_post("/api/v1/sessions/", {"season_id": season["id"], "player_a_id": me_a["id"]}, token_adm)
    assert status == 201, f"Create session failed: {sess}"
    room_code = sess["room_code"]
    print(f"  Room code: {room_code}")

    http_post(f"/api/v1/sessions/{room_code}/join", {}, token_b)

    # Get 20 unique characters
    _, chars = http_get("/api/v1/characters/", token_a)
    char_ids = [c["id"] for c in chars[:20]]

    # ── Connect WebSockets ───────────────────────────────────────────────────
    async with (
        websockets.connect(f"{BASE_WS}/ws/{room_code}?token={token_a}&role=player_a") as ws_a,
        websockets.connect(f"{BASE_WS}/ws/{room_code}?token={token_b}&role=player_b") as ws_b,
    ):
        # Consume initial SESSION_STATE
        await asyncio.wait_for(ws_a.recv(), timeout=5)
        await asyncio.wait_for(ws_b.recv(), timeout=5)
        print("  [0] SESSION_STATE ✓")

        # ── Ready Up ────────────────────────────────────────────────────────
        await send(ws_a, "PLAYER_READY_UP", {"is_ready": True})
        await send(ws_b, "PLAYER_READY_UP", {"is_ready": True})

        toss_msg = await recv_until(ws_a, "COIN_TOSS_RESULT")
        assert toss_msg, "COIN_TOSS_RESULT not received"
        winner = toss_msg["payload"]["winner"]
        loser  = toss_msg["payload"]["loser"]
        print(f"  [1] COIN_TOSS_RESULT: winner={winner} ✓")

        ws_winner = ws_a if winner == "player_a" else ws_b
        ws_loser  = ws_b if winner == "player_a" else ws_a

        # ── Winner picks privilege, Loser picks sub-choice ───────────────────
        await send(ws_winner, "TOSS_WINNER_PICK", {"privilege": "pick_order", "sub_choice": "first"})
        wc = await recv_until(ws_a, "WINNER_CHOSE")
        assert wc, "WINNER_CHOSE not received"
        print(f"  [2] WINNER_CHOSE ✓ (privilege=pick_order, sub_choice=first)")

        await send(ws_loser, "TOSS_LOSER_PICK", {"sub_choice": "first_half"})
        pc = await recv_until(ws_a, "PHASE_CHANGED")
        assert pc and pc["payload"]["new_status"] == "ban_phase_1", f"Expected ban_phase_1, got {pc}"
        print(f"  [3] PHASE_CHANGED → ban_phase_1 ✓")

        # ── Get first pick player from session ───────────────────────────────
        _, srv = http_get(f"/api/v1/sessions/{room_code}", token_a)
        first = srv["first_pick_player"]
        second = "player_b" if first == "player_a" else "player_a"
        ws_first  = ws_a if first == "player_a" else ws_b
        ws_second = ws_b if first == "player_a" else ws_a
        print(f"  first_pick={first}, first_half={srv['first_half_player']}")

        # ── 20-slot draft sequence ────────────────────────────────────────────
        # Slot assignments (actor in terms of first/second):
        # Phase 1 Ban:  F,S           (slots 1-2)
        # Phase 2 Pick: F,S,S,F,F,S,S,F (slots 3-10)
        # Phase 3 Ban:  F,S           (slots 11-12)
        # Phase 4 Pick: S,F,F,S,S,F,F,S (slots 13-20)
        slot_actors = [
            "first","second",                           # Phase 1 bans
            "first","second","second","first","first","second","second","first",  # Phase 2 picks
            "first","second",                           # Phase 3 bans
            "second","first","first","second","second","first","first","second",  # Phase 4 picks
        ]
        phase_boundaries = {2: "pick_phase_1", 10: "ban_phase_2", 12: "pick_phase_2", 20: "team_building"}

        for i, actor in enumerate(slot_actors):
            slot_num = i + 1
            ws_acting = ws_first if actor == "first" else ws_second
            await send(ws_acting, "SUBMIT_DRAFT_ACTION", {"character_id": char_ids[i]})

            da = await recv_until(ws_a, "DRAFT_ACTION", timeout=6)
            assert da, f"DRAFT_ACTION not received for slot {slot_num}"

            if slot_num in phase_boundaries:
                pc = await recv_until(ws_a, "PHASE_CHANGED", timeout=4)
                expected_phase = phase_boundaries[slot_num]
                actual_phase = pc["payload"]["new_status"] if pc else "NONE"
                ok = "✓" if actual_phase == expected_phase else f"✗ (got {actual_phase})"
                print(f"  [4.{slot_num}] PHASE_CHANGED → {expected_phase} {ok}")
            else:
                print(f"  [4.{slot_num}] DRAFT_ACTION slot={slot_num} char={char_ids[i]} ✓")

        # ── Both pass swap ───────────────────────────────────────────────────
        await send(ws_a, "PLAYER_PASS_SWAP")
        await send(ws_b, "PLAYER_PASS_SWAP")

        complete = await recv_until(ws_a, "SESSION_COMPLETE", timeout=8)
        assert complete, "SESSION_COMPLETE not received"
        teams = complete["payload"]["final_teams"]
        pa_count = len(teams.get("player_a", []))
        pb_count = len(teams.get("player_b", []))
        bans_count = len(teams.get("banned", []))
        print(f"  [5] SESSION_COMPLETE: player_a={pa_count} picks, player_b={pb_count} picks, bans={bans_count} ✓")
        assert pa_count == 8, f"Expected 8 picks for player_a, got {pa_count}"
        assert pb_count == 8, f"Expected 8 picks for player_b, got {pb_count}"
        assert bans_count == 4, f"Expected 4 bans, got {bans_count}"

    print("=" * 60)
    print("  All 20-slot WebSocket checks PASSED ✅")


if __name__ == "__main__":
    asyncio.run(run_test())
