from pydantic import BaseModel, Field


class ScheduleBookingRequest(BaseModel):
    tenant_slug: str = Field(..., min_length=1, max_length=120)
    name: str = Field(..., min_length=1, max_length=120)
    phone: str = Field(..., min_length=1, max_length=40)
    service: str = Field(..., min_length=1, max_length=120)
    attendance_mode: str = Field(..., min_length=1, max_length=40)
    date: str = Field(..., min_length=1, max_length=40)
    time: str = Field(..., min_length=1, max_length=40)
    note: str | None = Field(default=None, max_length=300)
    location_details: str | None = Field(default=None, max_length=220)


class ScheduleBookingResponse(BaseModel):
    id: int
    tenant_slug: str
    status: str = "pending"
    whatsapp_url: str | None = None
    notification_message: str | None = None


class AdminScheduleBookingItem(BaseModel):
    id: int
    name: str
    phone: str
    service: str
    attendance_mode: str
    date: str
    time: str
    note: str | None = None
    location_details: str | None = None
    status: str = "pending"
    created_at: str


class PublicScheduleAvailabilityResponse(BaseModel):
    tenant_slug: str
    blocked_dates: list[str] = Field(default_factory=list)
    blocked_slots: list[str] = Field(default_factory=list)
    booked_slots: list[str] = Field(default_factory=list)
