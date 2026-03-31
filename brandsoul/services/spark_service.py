import json

from models.spark import SparkPayload
from services.auth_store import get_spark_by_tenant_id, upsert_spark


def build_default_features(business_model: str, brand_type: str) -> dict[str, bool]:
    if business_model == "professional" or brand_type == "professional":
        return {"products": False, "services": True, "scheduling": False, "emergency": True}

    if business_model == "service":
        return {"products": False, "services": True, "scheduling": True, "emergency": False}

    return {"products": True, "services": False, "scheduling": False, "emergency": False}


def build_default_modes(features: dict[str, bool], business_model: str, brand_type: str) -> dict[str, bool]:
    return {
        "sales": features.get("products", False),
        "service": features.get("services", False) or business_model == "professional" or brand_type == "professional",
        "scheduling": features.get("scheduling", False),
        "emergency": features.get("emergency", False),
    }


def build_default_spark(tenant: dict) -> SparkPayload:
    return SparkPayload(
        brandName=tenant["name"],
        tone="divertido",
        power="atração",
        businessModel="product",
        brandType="business",
        features={"products": True, "services": False, "scheduling": False, "emergency": False},
        voiceStyle="balanced",
        actMode="seller",
        businessGoal="volume",
        modes={"sales": True, "service": True, "scheduling": False, "emergency": False},
    )


def serialize_spark_record(record: dict) -> SparkPayload:
    business_model = record.get("business_model") or "product"
    brand_type = record.get("brand_type") or "business"
    features = json.loads(record["features_json"]) if record.get("features_json") else build_default_features(business_model, brand_type)
    modes = json.loads(record["modes_json"]) if record.get("modes_json") else build_default_modes(features, business_model, brand_type)

    return SparkPayload(
        brandName=record["brand_name"],
        logo=record.get("logo"),
        tone=record["tone"],
        power=record["power"],
        businessModel=business_model,
        brandType=brand_type,
        features=features,
        voiceStyle=record["voice_style"],
        actMode=record["act_mode"],
        businessGoal=record["business_goal"],
        modes=modes,
        emergencyType=record.get("emergency_type"),
        serviceOffers=json.loads(record["service_offers_json"]) if record.get("service_offers_json") else [],
        schedulingConfig=json.loads(record["scheduling_config_json"]) if record.get("scheduling_config_json") else None,
        professionalData=json.loads(record["professional_data_json"]) if record.get("professional_data_json") else None,
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
        "business_model": spark.businessModel,
        "brand_type": spark.brandType,
        "features_json": json.dumps(spark.features.model_dump()) if spark.features else None,
        "voice_style": spark.voiceStyle,
        "act_mode": spark.actMode,
        "business_goal": spark.businessGoal,
        "modes_json": json.dumps(spark.modes.model_dump()) if spark.modes else None,
        "emergency_type": spark.emergencyType,
        "service_offers_json": json.dumps([item.model_dump() for item in (spark.serviceOffers or [])]),
        "scheduling_config_json": json.dumps(spark.schedulingConfig.model_dump()) if spark.schedulingConfig else None,
        "professional_data_json": json.dumps(spark.professionalData.model_dump()) if spark.professionalData else None,
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
