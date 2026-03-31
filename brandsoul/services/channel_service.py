import json
import re
import unicodedata
from datetime import UTC, datetime
from pathlib import Path

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
GUIDANCE_LOG_PATH = Path(__file__).resolve().parents[1] / "data" / "professional_guidance_logs.jsonl"
GUIDANCE_CLOSURE_TEXT = "Para uma análise completa e adequada ao seu caso, é importante falar diretamente com o profissional responsável."


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


def build_response_metadata(metadata: dict[str, str] | None, message: str, persona) -> dict[str, object]:
    detected_intent = detect_intent(message) if message.strip() else "unknown"
    response_metadata: dict[str, object] = {
        **(metadata or {}),
        "detected_intent": detected_intent,
        "commercial_intent": "true" if is_commercial_intent(detected_intent) else "false",
    }

    if persona.business_description and persona.business_description.strip():
        response_metadata["business_profile"] = infer_business_profile(persona.business_description)

    return response_metadata


def normalize_text(value: str) -> str:
    normalized_value = unicodedata.normalize("NFKD", value.casefold())
    return "".join(character for character in normalized_value if not unicodedata.combining(character))


def extract_user_statements(messages: list[Message], current_message: str) -> list[str]:
    user_messages = [item.content.strip() for item in messages if item.role == "user" and item.content.strip()]
    if current_message.strip():
        user_messages.append(current_message.strip())
    return user_messages[-6:]


def detect_information_signals(user_statements: list[str]) -> list[str]:
    joined_text = normalize_text(" ".join(user_statements))
    signal_rules = [
        ("tempo", (r"\b(agora|hoje|ontem|data|hora|horario)\b", r"\b\d{1,2}[:h]\d{2}\b", r"\b\d{1,2}/\d{1,2}\b")),
        ("local", (r"\b(local|rua|avenida|bairro|cidade|endereco)\b",)),
        ("descricao", (r"\b(bati|colidiu|acidente|problema|compra|produto|empresa|atendimento|aconteceu)\b",)),
        ("contato", (r"\b(nome|placa|empresa|envolvido|envolvidos|atendente)\b",)),
        ("evidencias", (r"\b(foto|fotos|video|videos|print|prints|comprovante|nota fiscal)\b",)),
    ]

    detected_signals: list[str] = []
    for label, patterns in signal_rules:
        if any(re.search(pattern, joined_text) for pattern in patterns):
            detected_signals.append(label)
    return detected_signals


def user_indicated_guidance_end(current_message: str) -> bool:
    normalized_message = normalize_text(current_message)
    end_patterns = (
        r"\b(obrigad[oa]|valeu|era isso|e isso|ja tenho|ja entendi|pode encerrar|pode fechar|finalizar|encerrar|conclui)\b",
    )
    return any(re.search(pattern, normalized_message) for pattern in end_patterns)


def should_close_guidance_flow(payload: ChannelMessage, persona: Persona, normalized_messages: list[Message]) -> bool:
    professional_data = persona.professional_data
    guidance = professional_data.guidance if professional_data else None
    if (
        payload.guidance_consent is not True
        or persona.business_model != "professional"
        or not professional_data
        or professional_data.operation_mode != "guidance"
    ):
        return False

    user_statements = extract_user_statements(normalized_messages, payload.message)
    if len(user_statements) < 2:
        return user_indicated_guidance_end(payload.message)

    if user_indicated_guidance_end(payload.message):
        return True

    information_signals = detect_information_signals(user_statements)
    if len(information_signals) >= 3 and len(user_statements) >= 3:
        return True

    selected_playbook = None
    if guidance and guidance.situation_type and guidance.playbooks:
        selected_playbook = guidance.playbooks.get(guidance.situation_type)

    if selected_playbook:
        checklist_items = [str(item).strip() for item in selected_playbook.get("action_checklist", []) if str(item).strip()]
        data_items = [str(item).strip() for item in selected_playbook.get("data_collection", []) if str(item).strip()]
        matched_data_points = 0
        normalized_joined_text = normalize_text(" ".join(user_statements))

        for item in data_items[:4]:
            normalized_item = normalize_text(item)
            item_tokens = [token for token in re.split(r"[^a-z0-9]+", normalized_item) if len(token) > 3]
            if normalized_item in normalized_joined_text or any(token in normalized_joined_text for token in item_tokens):
                matched_data_points += 1

        if matched_data_points >= 2 and (len(user_statements) >= 3 or len(checklist_items) > 0):
            return True

    return False


def detect_evidence_labels(user_statements: list[str]) -> list[str]:
    joined_text = " ".join(user_statements).casefold()
    evidence_map = [
        ("fotos", ("foto", "fotos", "imagem", "imagens")),
        ("vídeos", ("video", "vídeo", "videos", "vídeos")),
        ("prints", ("print", "prints", "captura", "capturas")),
        ("nota fiscal", ("nota fiscal", "cupom", "comprovante")),
        ("histórico da conversa", ("conversa", "atendimento", "mensagem", "whatsapp", "chat")),
        ("localização", ("local", "localizacao", "localização", "endereco", "endereço")),
        ("data e hora", ("data", "hora", "horario", "horário")),
    ]
    evidences = [label for label, keywords in evidence_map if any(keyword in joined_text for keyword in keywords)]
    return evidences


def build_case_summary(payload: ChannelMessage, persona: Persona, normalized_messages: list[Message]) -> dict[str, list[str] | str] | None:
    professional_data = persona.professional_data
    guidance = professional_data.guidance if professional_data else None
    if (
        payload.guidance_consent is not True
        or persona.business_model != "professional"
        or not professional_data
        or professional_data.operation_mode != "guidance"
    ):
        return None

    user_statements = extract_user_statements(normalized_messages, payload.message)
    if not user_statements:
        return None

    selected_playbook = None
    if guidance and guidance.situation_type and guidance.playbooks:
        selected_playbook = guidance.playbooks.get(guidance.situation_type)

    evidence_labels = detect_evidence_labels(user_statements)
    if selected_playbook and isinstance(selected_playbook.get("data_collection"), list):
        for item in selected_playbook["data_collection"]:
            normalized_item = str(item).strip()
            if normalized_item and normalized_item not in evidence_labels:
                if any(token in normalized_item.casefold() for token in ("foto", "vídeo", "video", "print", "nota", "histórico", "historico")):
                    evidence_labels.append(normalized_item)

    next_steps = ["Procurar profissional responsável", "Manter registros organizados", "Evitar decisões precipitadas"]
    if selected_playbook and isinstance(selected_playbook.get("action_checklist"), list):
        next_steps = [str(item).strip() for item in selected_playbook["action_checklist"] if str(item).strip()][:3] + ["Procurar profissional responsável"]

    return {
        "tipo": guidance.situation_type if guidance and guidance.situation_type else "orientacao_inicial",
        "dados": user_statements,
        "evidencias": evidence_labels or ["Observações relatadas na conversa"],
        "passos": next_steps[:4],
    }


def format_guidance_closure(response: str, case_summary: dict[str, list[str] | str] | None) -> str:
    summary_line = ""
    if case_summary:
        case_type = str(case_summary.get("tipo") or "orientação inicial").replace("_", " ")
        summary_line = f"Organizei um resumo inicial do caso em {case_type} para facilitar o encaminhamento."

    closing_lines = [line for line in (response.strip(), summary_line, GUIDANCE_CLOSURE_TEXT) if line]
    return "\n\n".join(closing_lines)


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
        business_model=spark.businessModel,
        brand_type=spark.brandType,
        features=spark.features.model_dump() if spark.features else None,
        voice_style=spark.voiceStyle,
        act_mode=spark.actMode,
        business_goal=spark.businessGoal,
        modes=spark.modes.model_dump() if spark.modes else None,
        emergency_type=spark.emergencyType,
        service_offers=[item.model_dump(by_alias=False) for item in (spark.serviceOffers or [])],
        scheduling_config=spark.schedulingConfig.model_dump(by_alias=False) if spark.schedulingConfig else None,
        professional_data=spark.professionalData.model_dump(by_alias=False) if spark.professionalData else None,
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


def should_log_professional_guidance(persona: Persona, payload: ChannelMessage) -> bool:
    return bool(
        payload.guidance_consent is True
        and payload.message.strip()
        and persona.business_model == "professional"
        and persona.professional_data
        and persona.professional_data.operation_mode == "guidance"
    )


def append_professional_guidance_log(
    payload: ChannelMessage,
    persona: Persona,
    response: str,
    response_metadata: dict[str, str | dict[str, str]],
) -> None:
    try:
        GUIDANCE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        guidance = persona.professional_data.guidance if persona.professional_data else None
        entry = {
            "timestamp": datetime.now(UTC).isoformat(),
            "user_id": payload.user_id,
            "brand_name": payload.brand_name,
            "user_input": payload.message,
            "ai_response": response,
            "guideline_type": guidance.situation_type if guidance and guidance.situation_type else "guidance",
            "decision_flow": {
                "context_mode": payload.context_mode or "customer",
                "mode": payload.mode or "service",
                "guidance_consent": payload.guidance_consent is True,
                "detected_intent": response_metadata.get("detected_intent"),
            },
        }
        with GUIDANCE_LOG_PATH.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        # Logging must never block the response flow.
        return


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
            response=build_initial_message(
                resolved_persona,
                resolved_brand_name,
                payload.context_mode or "customer",
                payload.mode,
            ),
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
        mode=payload.mode,
        guidance_consent=payload.guidance_consent is True,
    )

    flow_closed = should_close_guidance_flow(payload, resolved_persona, normalized_messages)
    if flow_closed:
        case_summary = build_case_summary(payload, resolved_persona, normalized_messages)
        response = format_guidance_closure(response, case_summary)
        response_metadata["flow_closed"] = True
        if case_summary:
            response_metadata["case_summary"] = case_summary

    if should_log_professional_guidance(resolved_persona, payload):
        append_professional_guidance_log(payload, resolved_persona, response, response_metadata)

    # Future channel auth, rate limiting, and webhook metadata handling can plug in here.
    return ChannelResponse(
        channel=payload.channel,
        user_id=payload.user_id,
        response=response,
        spark_state="speaking",
        memory_used=memory_used(normalized_messages),
        metadata=response_metadata,
    )
