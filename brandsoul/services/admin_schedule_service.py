from models.schedule import AdminScheduleBookingItem
from services.auth_store import list_schedule_bookings_by_tenant_id


def list_tenant_schedule_bookings(current_tenant: dict) -> list[AdminScheduleBookingItem]:
    rows = list_schedule_bookings_by_tenant_id(int(current_tenant["id"]))
    return [
        AdminScheduleBookingItem(
            id=int(row["id"]),
            name=row["name"],
            phone=row["phone"],
            service=row["service"],
            attendance_mode=row.get("attendance_mode") or "presencial",
            date=row["date"],
            time=row["time"],
            note=row.get("note"),
            location_details=row.get("location_details"),
            status=row.get("status") or "pending",
            created_at=row["created_at"],
        )
        for row in rows
    ]
