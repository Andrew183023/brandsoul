from typing import Literal

from pydantic import BaseModel, Field, field_validator


OPTIONAL_TEXT_MAX_LENGTH = 160


class OpeningHours(BaseModel):
    start: str = Field(..., min_length=5, max_length=5, examples=["09:00"])
    end: str = Field(..., min_length=5, max_length=5, examples=["18:00"])


class SparkModes(BaseModel):
    sales: bool = True
    service: bool = True
    scheduling: bool = False
    emergency: bool = False


class BrandFeatures(BaseModel):
    products: bool = True
    services: bool = False
    scheduling: bool = False
    emergency: bool = False


class ServiceOffer(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    summary: str | None = Field(default=None, max_length=200)
    label: str | None = Field(default=None, max_length=60)


class SchedulingConfig(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=200)


class ProfessionalCase(BaseModel):
    case_type: str | None = Field(default=None, max_length=80)
    context: str | None = Field(default=None, max_length=160)
    approach: str | None = Field(default=None, max_length=160)
    learning: str | None = Field(default=None, max_length=160)


class ProfessionalContent(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    summary: str | None = Field(default=None, max_length=200)
    stance: str | None = Field(default=None, max_length=160)


class ProfessionalIdentity(BaseModel):
    headline: str | None = Field(default=None, max_length=120)
    principles: list[str] = Field(default_factory=list)


class ProfessionalGuidance(BaseModel):
    situation_type: str | None = Field(default=None, max_length=80)
    initial_response: str | None = Field(default=None, max_length=220)
    initial_questions: list[str] = Field(default_factory=list)
    action_checklist: list[str] = Field(default_factory=list)
    data_collection: list[str] = Field(default_factory=list)
    orientation_limits: str | None = Field(default=None, max_length=220)
    communication_tone: str | None = Field(default=None, max_length=80)
    closing_message: str | None = Field(default=None, max_length=220)
    playbooks: dict[str, dict] = Field(default_factory=dict)


class ProfessionalData(BaseModel):
    operation_mode: Literal["institutional", "authority", "guidance"] = "institutional"
    presentation: str | None = Field(default=None, max_length=OPTIONAL_TEXT_MAX_LENGTH)
    practice_areas: list[str] = Field(default_factory=list)
    differentials: list[str] = Field(default_factory=list)
    cases: list[ProfessionalCase] = Field(default_factory=list)
    contents: list[ProfessionalContent] = Field(default_factory=list)
    identity: ProfessionalIdentity | None = None
    guidance: ProfessionalGuidance | None = None


class Persona(BaseModel):
    tone: str = Field(..., min_length=1, examples=["divertido"])
    power: str = Field(..., min_length=1, examples=["atração"])
    business_model: Literal["product", "service", "professional"] = "product"
    brand_type: Literal["business", "professional"] = "business"
    features: BrandFeatures = Field(default_factory=BrandFeatures)
    voice_style: str = Field(default="balanced", min_length=1, examples=["balanced"])
    act_mode: str = Field(default="seller", min_length=1, examples=["seller"])
    business_goal: str = Field(default="volume", min_length=1, examples=["volume"])
    modes: SparkModes = Field(default_factory=SparkModes)
    emergency_type: Literal["legal", "health", "technical"] | None = Field(default=None, examples=["technical"])
    service_offers: list[ServiceOffer] = Field(default_factory=list)
    scheduling_config: SchedulingConfig | None = None
    professional_data: ProfessionalData | None = None
    business_description: str | None = Field(
        default=None,
        max_length=OPTIONAL_TEXT_MAX_LENGTH,
        examples=["temos um restaurante japonês"],
    )
    opening_hours: OpeningHours | None = None
    address: str | None = Field(default=None, max_length=OPTIONAL_TEXT_MAX_LENGTH, examples=["Rua X, 123"])
    city: str | None = Field(default=None, max_length=OPTIONAL_TEXT_MAX_LENGTH, examples=["Belo Horizonte"])
    state: str | None = Field(default=None, max_length=OPTIONAL_TEXT_MAX_LENGTH, examples=["MG"])
    delivery_available: bool | None = None
    business_hours: str | None = Field(default=None, max_length=OPTIONAL_TEXT_MAX_LENGTH, examples=["18h às 23h"])
    service_region: str | None = Field(default=None, max_length=OPTIONAL_TEXT_MAX_LENGTH, examples=["Belo Horizonte"])
    brand_highlight: str | None = Field(
        default=None,
        max_length=OPTIONAL_TEXT_MAX_LENGTH,
        examples=["sushi artesanal premium"],
    )
    whatsapp: str | None = Field(
        default=None,
        max_length=OPTIONAL_TEXT_MAX_LENGTH,
        examples=["WhatsApp (31) 99999-0000"],
    )
    email: str | None = Field(
        default=None,
        max_length=OPTIONAL_TEXT_MAX_LENGTH,
        examples=["contato@marca.com"],
    )
    instagram: str | None = Field(default=None, max_length=OPTIONAL_TEXT_MAX_LENGTH, examples=["@marca"])
    facebook: str | None = Field(default=None, max_length=OPTIONAL_TEXT_MAX_LENGTH, examples=["/marca"])
    tiktok: str | None = Field(default=None, max_length=OPTIONAL_TEXT_MAX_LENGTH, examples=["@marca"])
    site: str | None = Field(
        default=None,
        max_length=OPTIONAL_TEXT_MAX_LENGTH,
        examples=["https://marca.com"],
    )
    contact_info: str | None = Field(
        default=None,
        max_length=OPTIONAL_TEXT_MAX_LENGTH,
        examples=["WhatsApp (31) 99999-0000"],
    )

    @field_validator(
        "business_description",
        "address",
        "city",
        "state",
        "business_hours",
        "service_region",
        "brand_highlight",
        "whatsapp",
        "email",
        "instagram",
        "facebook",
        "tiktok",
        "site",
        "contact_info",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None
