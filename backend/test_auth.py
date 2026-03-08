"""
test_auth.py — Auth & Characters endpoint smoke test.
Run from backend/ with venv active:
    python test_auth.py

Requires the server to be running:
    uvicorn app.main:app --reload --port 8000
"""
import sys
import urllib.request
import urllib.error
import json

BASE = "http://localhost:8000"


def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def get(path, token=None):
    req = urllib.request.Request(f"{BASE}{path}")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


print("=" * 50)
print("  Auth & Characters — Smoke Test")
print("=" * 50)

failures = []

# 1. Register player
status, body = post("/api/v1/auth/register", {"username": "testplayer", "password": "secret123", "role": "player"})
print(f"[1] Register player:  {status} → {body}")
if status not in (201, 409):
    failures.append("Register player failed")

# 2. Register admin
status, body = post("/api/v1/auth/register", {"username": "testadmin", "password": "adminpass", "role": "admin"})
print(f"[2] Register admin:   {status} → {body}")
if status not in (201, 409):
    failures.append("Register admin failed")

# 3. Login player
status, body = post("/api/v1/auth/login", {"username": "testplayer", "password": "secret123"})
print(f"[3] Login player:     {status} → {list(body.keys())}")
player_token = body.get("access_token")
if status != 200 or not player_token:
    failures.append("Login player failed")

# 4. Login admin
status, body = post("/api/v1/auth/login", {"username": "testadmin", "password": "adminpass"})
print(f"[4] Login admin:      {status} → {list(body.keys())}")
admin_token = body.get("access_token")
if status != 200 or not admin_token:
    failures.append("Login admin failed")

# 5. GET /me with player token
status, body = get("/api/v1/auth/me", player_token)
print(f"[5] GET /me (player): {status} → username={body.get('username')} role={body.get('role')}")
if status != 200:
    failures.append("/me failed")

# 6. GET /characters
status, body = get("/api/v1/characters/", player_token)
count = len(body) if isinstance(body, list) else 0
print(f"[6] GET /characters:  {status} → {count} characters returned")
if status != 200 or count < 10:
    failures.append("Characters endpoint failed or returned too few")

# 7. Unauthorized access (no token)
status, _ = get("/api/v1/characters/")
print(f"[7] No token → 401?  {status}")
if status != 401:
    failures.append("Expected 401 without token")

print("=" * 50)
if failures:
    print(f"  FAILURES: {failures}")
    sys.exit(1)
else:
    print("  All checks PASSED ✅")
