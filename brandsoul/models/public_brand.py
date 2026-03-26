from pydantic import BaseModel, Field

from models.catalog import CatalogItemPayload
from models.spark import SparkPageSections, SparkPayload, SparkTheme


class PublicPageHighlights(BaseModel):
    hasPromotions: bool = False
    hasNewArrivals: bool = False


class PublicBrandResponse(BaseModel):
    slug: str = Field(..., min_length=1)
    spark: SparkPayload
    catalog: list[CatalogItemPayload] = Field(default_factory=list)
    theme: SparkTheme | None = None
    pageSections: SparkPageSections | None = None
    pageHighlights: PublicPageHighlights | None = None
