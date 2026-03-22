from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def make_persona_payload(**overrides):
    payload = {
        "tone": "inteligente",
        "power": "clareza",
        "voice_style": "balanced",
        "business_description": "temos um restaurante japonês",
    }
    payload.update(overrides)
    return payload


def test_channel_message_without_history_returns_200(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/channel/message",
        json={
            "channel": "web",
            "user_id": "local-user",
            "brand_name": "Sakura Soul",
            "message": "",
            "persona": make_persona_payload(),
            "messages": [],
            "metadata": {"intent": "conversation_start"},
            "context_mode": "customer",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["spark_state"] == "speaking"
    assert body["memory_used"] is False


def test_channel_message_with_history_and_no_openai_key_returns_503(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/channel/message",
        json={
            "channel": "web",
            "user_id": "local-user",
            "brand_name": "Sakura Soul",
            "message": "quero pedir agora",
            "persona": make_persona_payload(),
            "messages": [{"role": "ai", "content": "Estou por aqui."}],
            "context_mode": "customer",
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "OPENAI_API_KEY is not configured."


def test_legacy_chat_without_history_still_bootstraps(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/chat",
        json={
            "brand_name": "Sakura Soul",
            "message": "",
            "persona": make_persona_payload(),
            "messages": [],
        },
    )

    assert response.status_code == 200
    assert "response" in response.json()


def test_channel_message_admin_mode_without_header_returns_403(monkeypatch):
    monkeypatch.setenv("ADMIN_ACCESS_KEY", "secret-admin-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/channel/message",
        json={
            "channel": "web",
            "user_id": "local-user",
            "brand_name": "Sakura Soul",
            "message": "",
            "persona": make_persona_payload(),
            "messages": [],
            "metadata": {"intent": "conversation_start"},
            "context_mode": "admin",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access denied."


def test_channel_message_admin_mode_with_header_returns_200(monkeypatch):
    monkeypatch.setenv("ADMIN_ACCESS_KEY", "secret-admin-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/channel/message",
        headers={"x-admin-key": "secret-admin-key"},
        json={
            "channel": "web",
            "user_id": "local-user",
            "brand_name": "Sakura Soul",
            "message": "",
            "persona": make_persona_payload(),
            "messages": [],
            "metadata": {"intent": "conversation_start"},
            "context_mode": "admin",
        },
    )

    assert response.status_code == 200
    assert response.json()["spark_state"] == "speaking"
