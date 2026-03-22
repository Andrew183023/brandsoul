from models.persona import Persona
from services.ai_service import (
    build_initial_message,
    build_system_prompt,
    detect_intent,
    infer_business_profile,
)


def make_persona(**overrides) -> Persona:
    base_data = {
        "tone": "inteligente",
        "power": "clareza",
        "voice_style": "balanced",
        "business_description": "temos um restaurante japonês",
    }
    base_data.update(overrides)
    return Persona(**base_data)


def test_detect_intent_core_cases():
    assert detect_intent("tem entrega?") == "delivery"
    assert detect_intent("qual horário?") == "business_hours"
    assert detect_intent("qual whatsapp?") == "contact_info"
    assert detect_intent("quero pedir agora") == "order"
    assert detect_intent("quanto custa?") == "price"
    assert detect_intent("oi") == "greeting"
    assert detect_intent("me explica melhor isso") == "unknown"


def test_infer_business_profile_core_cases():
    assert infer_business_profile("temos um restaurante japonês") == {
        "business_type": "service",
        "sector": "food",
        "model": "b2c",
        "complexity": "low",
    }

    assert infer_business_profile("somos uma plataforma de IA para empresas") == {
        "business_type": "service",
        "sector": "tech",
        "model": "hybrid",
        "complexity": "high",
    }

    assert infer_business_profile("somos uma fábrica industrial de componentes") == {
        "business_type": "industry",
        "sector": "industrial",
        "model": "b2b",
        "complexity": "high",
    }


def test_build_initial_message_keeps_first_person():
    message = build_initial_message(make_persona(), "Sakura Soul", context_mode="customer")
    lowered_message = message.lower()

    assert " eu " in f" {lowered_message} " or lowered_message.startswith("eu ") or " comigo" in lowered_message
    assert "a empresa" not in lowered_message


def test_build_system_prompt_includes_core_context_layers():
    prompt = build_system_prompt(
        brand_name="Sakura Soul",
        persona=make_persona(
            business_description="temos um restaurante japonês premium",
            voice_style="irreverent",
            delivery_available=True,
        ),
        current_message="cria um post para hoje a noite focado em delivery",
        context_mode="admin",
        memory_summary={
            "top_intents": ["delivery", "order"],
            "interaction_windows": ["noite"],
            "common_topics": ["promocao", "delivery"],
        },
    )
    lowered_prompt = prompt.lower()

    assert "primeira pessoa" in lowered_prompt
    assert "nunca diga frases como 'a empresa oferece'" in lowered_prompt
    assert "prefira sempre: 'eu funciono" in lowered_prompt
    assert "restaurante japonês premium" in prompt
    assert "estilo de voz principal: irreverent" in lowered_prompt
    assert "contexto de uso: admin" in lowered_prompt
    assert "memoria recente da marca" in lowered_prompt
