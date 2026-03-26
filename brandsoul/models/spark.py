from pydantic import BaseModel, Field


class SparkTheme(BaseModel):
    primaryColor: str | None = None
    secondaryColor: str | None = None


class SparkPageSections(BaseModel):
    showCarousel: bool = False
    showPromotions: bool = False
    showNewArrivals: bool = False


class SparkOpeningHours(BaseModel):
    start: str = Field(..., min_length=5, max_length=5)
    end: str = Field(..., min_length=5, max_length=5)


class SparkPayload(BaseModel):
    brandName: str = Field(default="Minha marca", min_length=1, max_length=140)
    logo: str | None = None
    tone: str = Field(default="divertido", min_length=1, max_length=40)
    power: str = Field(default="atração", min_length=1, max_length=40)
    voiceStyle: str = Field(default="balanced", min_length=1, max_length=40)
    actMode: str = Field(default="seller", min_length=1, max_length=40)
    businessGoal: str = Field(default="volume", min_length=1, max_length=40)
    businessDescription: str | None = None
    institutionalImage: str | None = None
    theme: SparkTheme | None = None
    pageSections: SparkPageSections | None = None
    carouselImages: list[str] = Field(default_factory=list)
    openingHours: SparkOpeningHours | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    deliveryAvailable: bool | None = None
    businessHours: str | None = None
    serviceRegion: str | None = None
    brandHighlight: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    tiktok: str | None = None
    site: str | None = None
    contactInfo: str | None = None

