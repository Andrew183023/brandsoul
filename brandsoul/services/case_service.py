import json

from fastapi import HTTPException

from models.case import CaseSubmitRequest, CaseSubmitResponse
from services.auth_store import create_case_submission, get_tenant_by_slug
from services.spark_service import fetch_tenant_spark


def resolve_case_destination(spark) -> str:
    if spark.whatsapp:
        return "whatsapp"
    if spark.email:
        return "email"
    return "panel"


def submit_case(payload: CaseSubmitRequest) -> CaseSubmitResponse:
    tenant = get_tenant_by_slug(payload.tenant_slug.strip().lower())
    if not tenant or not tenant.get("is_active"):
        raise HTTPException(status_code=404, detail="Brand not found.")

    spark = fetch_tenant_spark(tenant)
    destination = resolve_case_destination(spark)
    created_case = create_case_submission(
        tenant_id=int(tenant["id"]),
        user_id=payload.user_id,
        case_type=payload.case_type,
        summary=payload.summary,
        messages_json=json.dumps(payload.messages_relevant, ensure_ascii=False),
        evidences_json=json.dumps([item.model_dump() for item in payload.evidences], ensure_ascii=False),
        guidance_mode=payload.guidance_mode,
        destination=destination,
    )

    return CaseSubmitResponse(
        status="submitted",
        message="Caso enviado com sucesso. Um profissional irá analisar e entrar em contato.",
        destination=destination,  # type: ignore[arg-type]
        case_id=int(created_case["id"]),
        already_submitted=bool(created_case.get("already_submitted")),
    )
