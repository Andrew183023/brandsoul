from typing import Literal

from pydantic import BaseModel, Field


class CaseEvidenceItem(BaseModel):
    type: Literal["image", "video", "audio"]
    name: str = Field(..., min_length=1, max_length=240)
    count: int = Field(default=1, ge=1)
    timestamp: str = Field(..., min_length=1, max_length=80)


class CaseSubmitRequest(BaseModel):
    tenant_slug: str = Field(..., min_length=1, max_length=160)
    user_id: str = Field(..., min_length=1, max_length=160)
    case_type: str = Field(..., min_length=1, max_length=120)
    summary: str = Field(..., min_length=8, max_length=4000)
    messages_relevant: list[str] = Field(default_factory=list)
    evidences: list[CaseEvidenceItem] = Field(default_factory=list)
    timestamp: str = Field(..., min_length=1, max_length=80)
    guidance_mode: bool = True


class CaseSubmitResponse(BaseModel):
    status: Literal["submitted"]
    message: str
    destination: Literal["whatsapp", "email", "panel"]
    case_id: int
    already_submitted: bool = False
