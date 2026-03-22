from typing import Any, Literal

from pydantic import BaseModel, Field

from models.persona import Persona


InteractionContext = Literal["parceria", "indicacao", "combo", "negociacao", "colaboracao"]


class InteractionParticipant(BaseModel):
    brand_name: str = Field(..., min_length=1, examples=["BrandSoul"])
    persona: Persona


class InteractionRequest(BaseModel):
    initiator: InteractionParticipant
    receiver: InteractionParticipant
    context: InteractionContext = Field(..., examples=["parceria"])
    turns: int = Field(default=2, ge=2, le=4)


class InteractionTurn(BaseModel):
    speaker_id: Literal["a", "b"]
    brand_name: str
    content: str
    tone: str
    power: str
    business_profile: dict[str, str] | None = None


class InteractionResponse(BaseModel):
    context: InteractionContext
    turns: int
    transcript: list[InteractionTurn]
    metadata: dict[str, Any] | None = None