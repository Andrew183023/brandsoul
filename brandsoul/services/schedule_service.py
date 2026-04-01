from urllib.parse import quote

from fastapi import HTTPException, status

from models.schedule import PublicScheduleAvailabilityResponse, ScheduleBookingRequest, ScheduleBookingResponse
from services.auth_store import create_schedule_booking, get_tenant_by_slug, list_schedule_bookings_by_tenant_id
from services.spark_service import fetch_tenant_spark


def normalize_whatsapp_number(value: str | None) -> str | None:
    if not value:
        return None

    digits = "".join(character for character in value if character.isdigit())
    return digits or None


def format_booking_notification_message(
    payload: ScheduleBookingRequest,
    template: str | None = None,
) -> str:
    note = payload.note.strip() if payload.note else "Sem observação"
    location_details = payload.location_details.strip() if payload.location_details else "Não informado"
    replacements = {
        "{nome}": payload.name,
        "{telefone}": payload.phone,
        "{servico}": payload.service,
        "{modalidade}": payload.attendance_mode,
        "{data}": payload.date,
        "{horario}": payload.time,
        "{observacao}": note,
        "{local}": location_details,
    }

    message = (
        template
        or "Novo agendamento pelo BrandSoul:\n"
        "Nome: {nome}\n"
        "Telefone: {telefone}\n"
        "Serviço: {servico}\n"
        "Modalidade: {modalidade}\n"
        "Data: {data}\n"
        "Horário: {horario}\n"
        "Observação: {observacao}\n"
        "Local de atendimento: {local}"
    )

    for placeholder, value in replacements.items():
        message = message.replace(placeholder, value)

    return message


def submit_schedule_booking(payload: ScheduleBookingRequest) -> ScheduleBookingResponse:
    tenant = get_tenant_by_slug(payload.tenant_slug.strip().lower())
    if not tenant or not tenant.get("is_active"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")

    spark = fetch_tenant_spark(tenant)
    scheduling_config = spark.schedulingConfig
    if not scheduling_config or not scheduling_config.enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scheduling is not enabled for this brand.")

    attendance_modes = scheduling_config.attendanceModes
    allowed_modes = {
        "presencial": attendance_modes.presencial,
        "online": attendance_modes.online,
        "domicilio": attendance_modes.domicilio,
    }
    if not any(allowed_modes.values()) and scheduling_config.attendanceMode in allowed_modes:
        allowed_modes[scheduling_config.attendanceMode] = True

    is_valid_mode = payload.attendance_mode in {"presencial", "online", "domicilio"}
    if not is_valid_mode:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attendance mode.")

    if not allowed_modes.get(payload.attendance_mode, False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attendance mode is not available for this brand.")

    booking = create_schedule_booking(
        tenant_id=tenant["id"],
        name=payload.name.strip(),
        phone=payload.phone.strip(),
        service=payload.service.strip(),
        attendance_mode=payload.attendance_mode.strip(),
        date=payload.date.strip(),
        time=payload.time.strip(),
        note=payload.note.strip() if payload.note else None,
        location_details=payload.location_details.strip() if payload.location_details else None,
    )

    whatsapp_number = normalize_whatsapp_number(scheduling_config.whatsappNumber or spark.whatsapp)
    notification_message = None
    whatsapp_url = None
    if scheduling_config.whatsappNotificationEnabled and whatsapp_number:
        notification_message = format_booking_notification_message(payload, scheduling_config.whatsappMessageTemplate)
        whatsapp_url = f"https://wa.me/{whatsapp_number}?text={quote(notification_message)}"

    return ScheduleBookingResponse(
        id=int(booking["id"]),
        tenant_slug=tenant["slug"],
        status=booking.get("status") or "pending",
        whatsapp_url=whatsapp_url,
        notification_message=notification_message,
    )


def fetch_public_schedule_availability(slug: str) -> PublicScheduleAvailabilityResponse:
    tenant = get_tenant_by_slug(slug.strip().lower())
    if not tenant or not tenant.get("is_active"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")

    spark = fetch_tenant_spark(tenant)
    scheduling_config = spark.schedulingConfig
    if not scheduling_config or not scheduling_config.enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scheduling is not enabled for this brand.")

    bookings = list_schedule_bookings_by_tenant_id(int(tenant["id"]))
    booked_slots = [f'{booking["date"]}T{booking["time"]}' for booking in bookings if booking.get("date") and booking.get("time")]

    return PublicScheduleAvailabilityResponse(
        tenant_slug=tenant["slug"],
        blocked_dates=scheduling_config.blockedDates,
        blocked_slots=scheduling_config.blockedSlots,
        booked_slots=booked_slots,
    )
