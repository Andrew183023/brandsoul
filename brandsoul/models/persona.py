from pydantic import BaseModel, Field, field_validator


OPTIONAL_TEXT_MAX_LENGTH = 160


class OpeningHours(BaseModel):
    start: str = Field(..., min_length=5, max_length=5, examples=["09:00"])
    end: str = Field(..., min_length=5, max_length=5, examples=["18:00"])


class Persona(BaseModel):
    tone: str = Field(..., min_length=1, examples=["divertido"])
    power: str = Field(..., min_length=1, examples=["atração"])
    voice_style: str = Field(default="balanced", min_length=1, examples=["balanced"])
    act_mode: str = Field(default="seller", min_length=1, examples=["seller"])
    business_goal: str = Field(default="volume", min_length=1, examples=["volume"])
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
