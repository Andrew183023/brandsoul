from typing import Literal

from pydantic import BaseModel, Field


class CatalogItemPayload(BaseModel):
    id: str | None = None
    name: str = Field(..., min_length=1, max_length=140)
    description: str = Field(..., min_length=1, max_length=140)
    category: str | None = Field(default=None, max_length=40)
    price: str | None = Field(default=None, max_length=40)
    highlight: str | None = Field(default=None, max_length=40)
    priority: Literal["high", "medium", "low"] | None = "medium"
    isFeatured: bool | None = False
    isPromotion: bool | None = False
    isNewArrival: bool | None = False
    complements: list[str] = Field(default_factory=list)
    image: str | None = None
    images: list[str] = Field(default_factory=list)
    stock: int | None = None
    availability: Literal["available", "low", "out"] | None = "available"
    ctaLabel: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=140)

