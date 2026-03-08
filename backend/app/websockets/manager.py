import asyncio
from typing import DefaultDict
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """
    Manages WebSocket connections grouped by room and role.

    Structure:
        _rooms[room_code][role] = [WebSocket, ...]

    Roles:
        'player_a' — left team player
        'player_b' — right team player
        'admin'    — admin/commentator (multiple allowed)
    """

    def __init__(self):
        # Dict[room_code, Dict[role, List[WebSocket]]]
        self._rooms: DefaultDict[str, DefaultDict[str, list[WebSocket]]] = defaultdict(
            lambda: defaultdict(list)
        )

    async def connect(self, ws: WebSocket, room_code: str, role: str) -> None:
        """Accept the WebSocket and register it. Use only if WS hasn't been accepted yet."""
        await ws.accept()
        self._rooms[room_code][role].append(ws)

    def register(self, ws: WebSocket, room_code: str, role: str) -> None:
        """Register an already-accepted WebSocket without calling accept() again."""
        self._rooms[room_code][role].append(ws)

    def disconnect(self, ws: WebSocket, room_code: str, role: str) -> None:
        room = self._rooms.get(room_code)
        if room and role in room:
            try:
                room[role].remove(ws)
            except ValueError:
                pass
            # Clean up empty rooms
            if not any(room.values()):
                del self._rooms[room_code]

    async def broadcast_to_room(self, room_code: str, message: dict) -> None:
        """Send a JSON message to ALL connections in the room."""
        room = self._rooms.get(room_code, {})
        all_ws = [ws for connections in room.values() for ws in connections]
        if all_ws:
            await asyncio.gather(
                *[ws.send_json(message) for ws in all_ws],
                return_exceptions=True,
            )

    async def send_to_role(self, room_code: str, role: str, message: dict) -> None:
        """Send a JSON message only to connections with a specific role."""
        room = self._rooms.get(room_code, {})
        targets = room.get(role, [])
        if targets:
            await asyncio.gather(
                *[ws.send_json(message) for ws in targets],
                return_exceptions=True,
            )

    def get_connected_roles(self, room_code: str) -> set[str]:
        """Returns the set of roles that currently have active connections."""
        room = self._rooms.get(room_code, {})
        return {role for role, conns in room.items() if conns}


# Singleton instance shared across the app
manager = ConnectionManager()
