from typing import Any, Literal

from pydantic import BaseModel, Field

from models.persona import Persona


class Message(BaseModel):
    role: Literal["user", "ai"]
    content: str = Field(..., min_length=1)


class MemorySummary(BaseModel):
    top_intents: list[str] = Field(default_factory=list)
    common_topics: list[str] = Field(default_factory=list)
    interaction_windows: list[str] = Field(default_factory=list)


class ChannelMessage(BaseModel):
    channel: str = Field(..., min_length=1, examples=["web"])
    user_id: str = Field(..., min_length=1, examples=["local-user"])
    brand_name: str = Field(..., min_length=1, examples=["BrandSoul"])
    message: str = Field(
        ...,
        min_length=0,
        examples=["", "Como vocês transformam uma marca comum em memorável?"],
    )
    persona: Persona
    messages: list[Message] | None = None
    metadata: dict[str, str] | None = None
    memory_summary: MemorySummary | None = None
    context_mode: Literal["customer", "admin"] | str | None = "customer"


class ChannelResponse(BaseModel):
    channel: str
    user_id: str
    response: str
    spark_state: str
    memory_used: bool
    metadata: dict[str, Any] | None = None


class ChatRequest(BaseModel):
    brand_name: str = Field(..., min_length=1, examples=["BrandSoul"])
    message: str = Field(
        ...,
        min_length=0,
        examples=["", "Como vocês transformam uma marca comum em memorável?"],
    )
    persona: Persona
    messages: list[Message] | None = None


class ChatResponse(BaseModel):
    response: str
