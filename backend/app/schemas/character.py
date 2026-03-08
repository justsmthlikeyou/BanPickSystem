from pydantic import BaseModel


class CharacterOut(BaseModel):
    id: int
    name: str
    icon_url: str
    splash_art_url: str

    model_config = {"from_attributes": True}
