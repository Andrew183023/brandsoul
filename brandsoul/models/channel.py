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


class CatalogSummaryItem(BaseModel):
    name: str = Field(..., min_length=1)
    availability: Literal["available", "low", "out"] = "available"
    price: str | None = None
    is_featured: bool = False
    priority: Literal["high", "medium", "low"] = "medium"
    highlight: str | None = None
    description: str | None = None
    complements: list[str] = Field(default_factory=list)


class LocationSummary(BaseModel):
    address: str | None = None
    city: str | None = None
    state: str | None = None


class PageHighlights(BaseModel):
    has_promotions: bool = False
    has_new_arrivals: bool = False


class ChannelMessage(BaseModel):
    channel: str = Field(..., min_length=1, examples=["web"])
    user_id: str = Field(..., min_length=1, examples=["local-user"])
    brand_name: str = Field(..., min_length=1, examples=["BrandSoul"])
    tenant_slug: str | None = Field(default=None, min_length=1, examples=["vista-verde"])
    mode: Literal["sales", "service", "scheduling", "emergency"] | str | None = "service"
    guidance_consent: bool | None = None
    message: str = Field(
        ...,
        min_length=0,
        examples=["", "Como vocês transformam uma marca comum em memorável?"],
    )
    persona: Persona
    messages: list[Message] | None = None
    metadata: dict[str, str] | None = None
    memory_summary: MemorySummary | None = None
    catalog_summary: list[CatalogSummaryItem] | None = None
    business_goal: Literal["volume", "ticket", "rotation", "launch"] | str | None = "volume"
    location_summary: LocationSummary | None = None
    page_highlights: PageHighlights | None = None
    business_status: Literal["open", "closed"] | None = None
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
