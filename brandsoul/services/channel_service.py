from models.channel import ChannelMessage, ChannelResponse, Message
from services.ai_service import (
    build_initial_message,
    detect_intent,
    generate_response,
    infer_business_profile,
    is_commercial_intent,
)


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


def handle_channel_message(payload: ChannelMessage) -> ChannelResponse:
    # Future channel-specific validation can be added here.
    normalized_messages = normalize_history(payload.messages)
    normalized_metadata = normalize_metadata(payload)
    channel_context = build_channel_ai_context(payload.channel, normalized_metadata)
    response_metadata = build_response_metadata(normalized_metadata, payload.message, payload.persona)

    if should_bootstrap_initial_response(payload.message, normalized_messages, normalized_metadata):
        return ChannelResponse(
            channel=payload.channel,
            user_id=payload.user_id,
            response=build_initial_message(payload.persona, payload.brand_name, payload.context_mode or "customer"),
            spark_state="speaking",
            memory_used=False,
            metadata=response_metadata,
        )

    # Future platform adapters can translate webhooks/events into ChannelMessage before this point.
    response = generate_response(
        message=payload.message,
        persona=payload.persona,
        brand_name=payload.brand_name,
        messages=normalized_messages,
        channel=payload.channel,
        metadata=normalized_metadata,
        channel_context=channel_context,
        memory_summary=payload.memory_summary.model_dump() if payload.memory_summary else None,
        catalog_summary=[item.model_dump() for item in payload.catalog_summary] if payload.catalog_summary else None,
        location_summary=payload.location_summary.model_dump() if payload.location_summary else None,
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
