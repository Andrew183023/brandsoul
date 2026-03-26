from models.channel import CatalogSummaryItem, ChannelMessage, ChannelResponse, LocationSummary, Message, PageHighlights
from models.persona import Persona
from models.spark import SparkPayload
from services.auth_store import get_tenant_by_slug
from services.ai_service import (
    build_initial_message,
    detect_intent,
    generate_response,
    infer_business_profile,
    is_commercial_intent,
)
from services.catalog_service import list_tenant_catalog
from services.spark_service import fetch_tenant_spark


MAX_HISTORY_MESSAGES = 8


def normalize_history(messages: list[Message] | None) -> list[Message]:
    return (messages or [])[-MAX_HISTORY_MESSAGES:]


def memory_used(messages: list[Message]) -> bool:
    return len(messages) > 0


def normalize_metadata(payload: ChannelMessage) -> dict[str, str] | None:
    metadata = payload.metadata or None
    if not metadata:
        return None

    if payload.channel == "instagram":
        source = metadata.get("source", "dm")
        normalized_source = source if source in {"dm", "comment"} else "dm"
        normalized_metadata = {"source": normalized_source}

        for key in ("username", "post_id", "comment_id", "intent"):
            value = metadata.get(key)
            if value:
                normalized_metadata[key] = value

        # Future Instagram webhook adapters can enrich this metadata before reaching the core handler.
        return normalized_metadata

    return metadata


def build_channel_ai_context(channel: str, metadata: dict[str, str] | None) -> str | None:
    if channel != "instagram" or not metadata:
        return None

    context_parts = [
        "Canal: instagram.",
        f"Origem: {metadata.get('source', 'dm')}.",
    ]

    if metadata.get("username"):
        context_parts.append(f"Usuário: @{metadata['username']}.")

    if metadata.get("post_id"):
        context_parts.append(f"Post: {metadata['post_id']}.")

    if metadata.get("comment_id"):
        context_parts.append(f"Comentário: {metadata['comment_id']}.")

    return " ".join(context_parts)


def build_response_metadata(metadata: dict[str, str] | None, message: str, persona) -> dict[str, str | dict[str, str]]:
    detected_intent = detect_intent(message) if message.strip() else "unknown"
    response_metadata: dict[str, str | dict[str, str]] = {
        **(metadata or {}),
        "detected_intent": detected_intent,
        "commercial_intent": "true" if is_commercial_intent(detected_intent) else "false",
    }

    if persona.business_description and persona.business_description.strip():
        response_metadata["business_profile"] = infer_business_profile(persona.business_description)

    return response_metadata


def should_bootstrap_initial_response(
    message: str,
    messages: list[Message] | None,
    metadata: dict[str, str] | None,
) -> bool:
    if normalize_history(messages):
        return False

    if (metadata or {}).get("intent") == "conversation_start":
        return True

    return not message.strip()


def build_persona_from_spark(spark: SparkPayload) -> Persona:
    return Persona(
        tone=spark.tone,
        power=spark.power,
        voice_style=spark.voiceStyle,
        act_mode=spark.actMode,
        business_goal=spark.businessGoal,
        business_description=spark.businessDescription,
        opening_hours=spark.openingHours.model_dump() if spark.openingHours else None,
        address=spark.address,
        city=spark.city,
        state=spark.state,
        delivery_available=spark.deliveryAvailable,
        business_hours=spark.businessHours,
        service_region=spark.serviceRegion,
        brand_highlight=spark.brandHighlight,
        whatsapp=spark.whatsapp,
        email=spark.email,
        instagram=spark.instagram,
        facebook=spark.facebook,
        tiktok=spark.tiktok,
        site=spark.site,
        contact_info=spark.contactInfo,
    )


def build_catalog_summary_from_catalog(catalog_items) -> list[CatalogSummaryItem] | None:
    if not catalog_items:
        return None

    return [
        CatalogSummaryItem(
            name=item.name,
            availability=item.availability or "available",
            price=item.price,
            is_featured=item.isFeatured is True,
            priority=item.priority or "medium",
            highlight=item.highlight,
            description=item.description,
            complements=item.complements or [],
        )
        for item in catalog_items
    ]


def build_location_summary_from_spark(spark: SparkPayload) -> LocationSummary | None:
    if not any((spark.address, spark.city, spark.state)):
        return None

    return LocationSummary(address=spark.address, city=spark.city, state=spark.state)


def build_page_highlights_from_catalog(catalog_items) -> PageHighlights | None:
    has_promotions = any(item.isPromotion for item in catalog_items)
    has_new_arrivals = any(item.isNewArrival for item in catalog_items)
    if not has_promotions and not has_new_arrivals:
        return None

    return PageHighlights(has_promotions=has_promotions, has_new_arrivals=has_new_arrivals)


def resolve_public_brand_payload(payload: ChannelMessage) -> tuple[str, Persona, list[CatalogSummaryItem] | None, str | None, LocationSummary | None, PageHighlights | None]:
    if not payload.tenant_slug:
        return (
            payload.brand_name,
            payload.persona,
            payload.catalog_summary,
            payload.business_goal,
            payload.location_summary,
            payload.page_highlights,
        )

    tenant = get_tenant_by_slug(payload.tenant_slug.strip().lower())
    if not tenant or not tenant.get("is_active"):
        raise ValueError("Brand not found.")

    spark = fetch_tenant_spark(tenant)
    catalog_items = list_tenant_catalog(tenant)
    return (
        spark.brandName,
        build_persona_from_spark(spark),
        build_catalog_summary_from_catalog(catalog_items),
        spark.businessGoal,
        build_location_summary_from_spark(spark),
        build_page_highlights_from_catalog(catalog_items),
    )


def handle_channel_message(payload: ChannelMessage) -> ChannelResponse:
    # Future channel-specific validation can be added here.
    normalized_messages = normalize_history(payload.messages)
    normalized_metadata = normalize_metadata(payload)
    (
        resolved_brand_name,
        resolved_persona,
        resolved_catalog_summary,
        resolved_business_goal,
        resolved_location_summary,
        resolved_page_highlights,
    ) = resolve_public_brand_payload(payload)
    channel_context = build_channel_ai_context(payload.channel, normalized_metadata)
    response_metadata = build_response_metadata(normalized_metadata, payload.message, resolved_persona)

    if should_bootstrap_initial_response(payload.message, normalized_messages, normalized_metadata):
        return ChannelResponse(
            channel=payload.channel,
            user_id=payload.user_id,
            response=build_initial_message(resolved_persona, resolved_brand_name, payload.context_mode or "customer"),
            spark_state="speaking",
            memory_used=False,
            metadata=response_metadata,
        )

    # Future platform adapters can translate webhooks/events into ChannelMessage before this point.
    response = generate_response(
        message=payload.message,
        persona=resolved_persona,
        brand_name=resolved_brand_name,
        messages=normalized_messages,
        channel=payload.channel,
        metadata=normalized_metadata,
        channel_context=channel_context,
        memory_summary=payload.memory_summary.model_dump() if payload.memory_summary else None,
        catalog_summary=[item.model_dump() for item in resolved_catalog_summary] if resolved_catalog_summary else None,
        business_goal=resolved_business_goal or resolved_persona.business_goal,
        location_summary=resolved_location_summary.model_dump() if resolved_location_summary else None,
        page_highlights=resolved_page_highlights.model_dump() if resolved_page_highlights else None,
        business_status=payload.business_status,
        context_mode=payload.context_mode or "customer",
    )

    # Future channel auth, rate limiting, and webhook metadata handling can plug in here.
    return ChannelResponse(
        channel=payload.channel,
        user_id=payload.user_id,
        response=response,
        spark_state="speaking",
        memory_used=memory_used(normalized_messages),
        metadata=response_metadata,
    )
