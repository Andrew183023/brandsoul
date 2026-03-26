import json

from models.spark import SparkPayload
from services.auth_store import get_spark_by_tenant_id, upsert_spark


def build_default_spark(tenant: dict) -> SparkPayload:
    return SparkPayload(
        brandName=tenant["name"],
        tone="divertido",
        power="atração",
        voiceStyle="balanced",
        actMode="seller",
        businessGoal="volume",
    )


def serialize_spark_record(record: dict) -> SparkPayload:
    return SparkPayload(
        brandName=record["brand_name"],
        logo=record.get("logo"),
        tone=record["tone"],
        power=record["power"],
        voiceStyle=record["voice_style"],
        actMode=record["act_mode"],
        businessGoal=record["business_goal"],
        businessDescription=record.get("business_description"),
        institutionalImage=record.get("institutional_image"),
        theme=json.loads(record["theme_json"]) if record.get("theme_json") else None,
        pageSections=json.loads(record["page_sections_json"]) if record.get("page_sections_json") else None,
        carouselImages=json.loads(record["carousel_images_json"]) if record.get("carousel_images_json") else [],
        openingHours=json.loads(record["opening_hours_json"]) if record.get("opening_hours_json") else None,
        address=record.get("address"),
        city=record.get("city"),
        state=record.get("state"),
        deliveryAvailable=None if record.get("delivery_available") is None else bool(record["delivery_available"]),
        businessHours=record.get("business_hours"),
        serviceRegion=record.get("service_region"),
        brandHighlight=record.get("brand_highlight"),
        whatsapp=record.get("whatsapp"),
        email=record.get("email"),
        instagram=record.get("instagram"),
        facebook=record.get("facebook"),
        tiktok=record.get("tiktok"),
        site=record.get("site"),
        contactInfo=record.get("contact_info"),
    )


def fetch_tenant_spark(tenant: dict) -> SparkPayload:
    spark_record = get_spark_by_tenant_id(tenant["id"])
    if not spark_record:
        return build_default_spark(tenant)

    return serialize_spark_record(spark_record)


def save_tenant_spark(tenant: dict, spark: SparkPayload) -> SparkPayload:
    payload = {
        "brand_name": spark.brandName,
        "logo": spark.logo,
        "tone": spark.tone,
        "power": spark.power,
        "voice_style": spark.voiceStyle,
        "act_mode": spark.actMode,
        "business_goal": spark.businessGoal,
        "business_description": spark.businessDescription,
        "institutional_image": spark.institutionalImage,
        "theme_json": json.dumps(spark.theme.model_dump()) if spark.theme else None,
        "page_sections_json": json.dumps(spark.pageSections.model_dump()) if spark.pageSections else None,
        "carousel_images_json": json.dumps(spark.carouselImages or []),
        "opening_hours_json": json.dumps(spark.openingHours.model_dump()) if spark.openingHours else None,
        "address": spark.address,
        "city": spark.city,
        "state": spark.state,
        "delivery_available": None if spark.deliveryAvailable is None else int(spark.deliveryAvailable),
        "business_hours": spark.businessHours,
        "service_region": spark.serviceRegion,
        "brand_highlight": spark.brandHighlight,
        "whatsapp": spark.whatsapp,
        "email": spark.email,
        "instagram": spark.instagram,
        "facebook": spark.facebook,
        "tiktok": spark.tiktok,
        "site": spark.site,
        "contact_info": spark.contactInfo,
    }
    saved_record = upsert_spark(tenant_id=tenant["id"], spark_payload=payload)
    return serialize_spark_record(saved_record)
