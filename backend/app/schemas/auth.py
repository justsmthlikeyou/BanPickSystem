from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    model_config = {"extra": "forbid"}
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    role: str = Field(default="player", pattern="^(player|admin)$")


class LoginRequest(BaseModel):
    model_config = {"extra": "forbid"}
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    id: int
    username: str
    role: str

    model_config = {"from_attributes": True}
