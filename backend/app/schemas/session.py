from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.schemas.character import CharacterOut


class SessionCreate(BaseModel):
    """Admin-only: create a new draft room."""
    model_config = {"extra": "forbid"}
    season_id: int
    player_a_id: Optional[int] = None


class DraftActionOut(BaseModel):
    id: int
    sequence_num: int
    action_type: str          # 'ban' | 'pick'
    acting_player: str        # 'player_a' | 'player_b'
    character: CharacterOut
    timestamp: datetime

    model_config = {"from_attributes": True}


class SwapOut(BaseModel):
    id: int
    player: str
    original_character: CharacterOut
    free_character: CharacterOut
    timestamp: datetime

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    """Full session snapshot — used by REST GET and WS SESSION_STATE event."""
    id: int
    room_code: str
    status: str

    player_a_id: Optional[int] = None
    player_b_id: Optional[int] = None
    admin_id: Optional[int] = None
    season_id: int

    player_a_ready: bool
    player_b_ready: bool

    # Coin toss results
    coin_toss_winner: Optional[str] = None
    toss_winner_choice: Optional[str] = None   # 'pick_order' | 'abyss_side'

    # Resolved advantages (None until each player makes their sub-choice)
    first_pick_player: Optional[str] = None    # 'player_a' | 'player_b'
    first_half_player: Optional[str] = None    # 'player_a' | 'player_b'

    draft_actions: list[DraftActionOut] = []
    team_building_swaps: list[SwapOut] = []

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FreeCharacterOut(BaseModel):
    id: int
    character: CharacterOut

    model_config = {"from_attributes": True}


class SeasonCreate(BaseModel):
    model_config = {"extra": "forbid"}
    name: str


class FreeCharAssign(BaseModel):
    model_config = {"extra": "forbid"}
    character_ids: list[int]
