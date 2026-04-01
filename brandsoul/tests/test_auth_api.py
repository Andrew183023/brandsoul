from fastapi.testclient import TestClient

from main import app
from services.auth_store import get_latest_password_reset_token_for_user, get_user_by_email


client = TestClient(app)


def test_register_creates_user_tenant_and_membership(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "auth-register.db"))

    response = client.post(
        "/auth/register",
        json={
            "name": "Andrew",
            "email": "andrew@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "Vista Verde",
            "business_model": "service",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token"]
    assert body["user"]["email"] == "andrew@example.com"
    assert body["tenant"]["name"] == "Vista Verde"
    assert body["tenant"]["slug"] == "vista-verde"


def test_login_and_authenticated_endpoints_work(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "auth-login.db"))

    register_response = client.post(
        "/auth/register",
        json={
            "name": "Andrew",
            "email": "owner@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "Casa Solar",
            "business_model": "hybrid",
        },
    )
    assert register_response.status_code == 200

    login_response = client.post(
        "/auth/login",
        json={
            "email": "owner@example.com",
            "password": "SenhaSegura123",
        },
    )

    assert login_response.status_code == 200
    login_body = login_response.json()
    token = login_body["token"]
    assert token
    assert login_body["tenant"]["slug"] == "casa-solar"

    me_response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    tenant_response = client.get("/tenant/me", headers={"Authorization": f"Bearer {token}"})

    assert me_response.status_code == 200
    assert me_response.json()["email"] == "owner@example.com"

    assert tenant_response.status_code == 200
    assert tenant_response.json()["name"] == "Casa Solar"


def test_admin_spark_roundtrip_uses_authenticated_tenant(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "spark.db"))

    register_response = client.post(
        "/auth/register",
        json={
            "name": "Owner",
            "email": "spark@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "Fogo Vivo",
            "business_model": "service",
        },
    )
    token = register_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    spark_response = client.get("/admin/spark", headers=headers)
    assert spark_response.status_code == 200
    assert spark_response.json()["brandName"] == "Fogo Vivo"

    save_response = client.put(
        "/admin/spark",
        headers=headers,
        json={
            "brandName": "Fogo Vivo",
            "tone": "ousado",
            "power": "atração",
            "voiceStyle": "strong",
            "actMode": "seller",
            "businessGoal": "volume",
            "businessDescription": "Marca com presenca forte.",
            "theme": {"primaryColor": "#111111", "secondaryColor": "#ff6600"},
            "pageSections": {"showCarousel": True, "showPromotions": False, "showNewArrivals": True},
            "carouselImages": ["data:image/png;base64,abc"],
            "openingHours": {"start": "09:00", "end": "18:00"},
        },
    )

    assert save_response.status_code == 200
    assert save_response.json()["tone"] == "ousado"
    assert save_response.json()["theme"]["secondaryColor"] == "#ff6600"

    refreshed_response = client.get("/admin/spark", headers=headers)
    assert refreshed_response.status_code == 200
    assert refreshed_response.json()["businessDescription"] == "Marca com presenca forte."


def test_admin_spark_roundtrip_persists_new_configuration_blocks(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "spark-professional.db"))

    register_response = client.post(
        "/auth/register",
        json={
            "name": "Owner",
            "email": "professional@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "ACF Advocacia",
            "business_model": "service",
        },
    )
    assert register_response.status_code == 200
    token = register_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    save_response = client.put(
        "/admin/spark",
        headers=headers,
        json={
            "brandName": "ACF Advocacia",
            "logo": "data:image/png;base64,abc123",
            "tone": "inteligente",
            "power": "clareza",
            "businessModel": "professional",
            "brandType": "professional",
            "features": {
                "products": False,
                "services": True,
                "scheduling": False,
                "emergency": True,
            },
            "voiceStyle": "balanced",
            "actMode": "consultant",
            "businessGoal": "ticket",
            "modes": {
                "sales": False,
                "service": True,
                "scheduling": False,
                "emergency": True,
            },
            "emergencyType": "legal",
            "emergencyMode": {
                "enabled": True,
                "autoStart": True,
                "showUploadEarly": True,
            },
            "ctaConfig": {
                "whatsappEnabled": True,
                "whatsappNumber": "+5531999999999",
                "whatsappMessageTemplate": "Tipo: {tipo}\nResumo: {resumo}",
                "showAfterEvidence": True,
                "showOnCompletion": True,
                "primaryText": "Encaminhar para profissional",
                "secondaryText": "Leve esse caso para análise.",
            },
            "businessDescription": "Atuação jurídica com foco em orientação inicial estruturada.",
            "institutionalImage": "data:image/png;base64,def456",
            "theme": {"primaryColor": "#112233", "secondaryColor": "#445566"},
            "pageSections": {"showCarousel": False, "showPromotions": False, "showNewArrivals": False},
            "address": "Rua A, 10",
            "city": "Belo Horizonte",
            "state": "MG",
            "whatsapp": "+5531999999999",
            "email": "contato@acf.com",
            "professionalData": {
                "operationMode": "guidance",
                "presentation": "Atuação estratégica com clareza técnica.",
                "practiceAreas": ["Consumidor", "Cível"],
                "differentials": ["Resposta ágil", "Análise cuidadosa"],
                "cases": [
                    {
                        "caseType": "Acidente de trânsito",
                        "context": "Colisão com fuga",
                        "approach": "Organização inicial de provas",
                        "learning": "Ganhar contexto rápido",
                    }
                ],
                "contents": [
                    {
                        "title": "Primeiros passos após um acidente",
                        "summary": "Como organizar documentos e provas.",
                        "stance": "Orientação inicial informativa.",
                    }
                ],
                "identity": {
                    "headline": "Clareza técnica e atuação responsável.",
                    "principles": ["Ética", "Clareza"],
                },
                "guidance": {
                    "situationType": "acidente_transito",
                    "initialResponse": "Vamos organizar os fatos essenciais.",
                    "initialQuestions": ["Quando aconteceu?", "Há feridos?"],
                    "actionChecklist": ["Registrar local", "Guardar provas"],
                    "dataCollection": ["Data", "Local", "Fotos"],
                    "orientationLimits": "Não emitir parecer definitivo.",
                    "communicationTone": "Sereno e objetivo",
                    "closingMessage": "Um profissional fará a análise completa.",
                    "playbooks": {
                        "acidente_transito": {
                            "situationType": "acidente_transito",
                            "initialResponse": "Vamos organizar os fatos essenciais.",
                            "initialQuestions": ["Quando aconteceu?"],
                            "actionChecklist": ["Registrar local"],
                            "dataCollection": ["Data"],
                            "orientationLimits": "Não emitir parecer definitivo.",
                            "closingMessage": "Um profissional fará a análise completa.",
                        }
                    },
                },
            },
        },
    )

    assert save_response.status_code == 200
    body = save_response.json()
    assert body["brandType"] == "professional"
    assert body["businessModel"] == "professional"
    assert body["emergencyMode"]["autoStart"] is True
    assert body["ctaConfig"]["whatsappEnabled"] is True
    assert body["professionalData"]["operationMode"] == "guidance"
    assert body["professionalData"]["guidance"]["situationType"] == "acidente_transito"

    refreshed_response = client.get("/admin/spark", headers=headers)
    assert refreshed_response.status_code == 200
    refreshed_body = refreshed_response.json()
    assert refreshed_body["emergencyType"] == "legal"
    assert refreshed_body["emergencyMode"]["showUploadEarly"] is True
    assert refreshed_body["ctaConfig"]["primaryText"] == "Encaminhar para profissional"
    assert refreshed_body["professionalData"]["presentation"] == "Atuação estratégica com clareza técnica."
    assert refreshed_body["professionalData"]["guidance"]["communicationTone"] == "Sereno e objetivo"
    assert refreshed_body["theme"]["secondaryColor"] == "#445566"


def test_admin_catalog_crud_uses_authenticated_tenant(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "catalog.db"))

    register_response = client.post(
        "/auth/register",
        json={
            "name": "Owner",
            "email": "catalog@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "Atelie Vento",
            "business_model": "product",
        },
    )
    token = register_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/admin/catalog",
        headers=headers,
        json={
            "name": "Camisa Essencial",
            "description": "Opcao principal da colecao.",
            "category": "Vestuario",
            "price": "R$ 129",
            "highlight": "Mais vendida",
            "priority": "high",
            "isFeatured": True,
            "complements": ["Calca", "Jaqueta"],
            "availability": "available",
        },
    )

    assert create_response.status_code == 200
    created_item = create_response.json()
    item_id = created_item["id"]
    assert created_item["name"] == "Camisa Essencial"

    list_response = client.get("/admin/catalog", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    update_response = client.put(
        f"/admin/catalog/{item_id}",
        headers=headers,
        json={
            "id": item_id,
            "name": "Camisa Essencial",
            "description": "Opcao principal da colecao em nova fase.",
            "category": "Vestuario",
            "price": "R$ 139",
            "highlight": "Destaque",
            "priority": "medium",
            "isPromotion": True,
            "availability": "low",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["price"] == "R$ 139"
    assert update_response.json()["isPromotion"] is True

    delete_response = client.delete(f"/admin/catalog/{item_id}", headers=headers)
    assert delete_response.status_code == 200

    final_list_response = client.get("/admin/catalog", headers=headers)
    assert final_list_response.status_code == 200
    assert final_list_response.json() == []


def test_public_brand_by_slug_returns_public_spark_and_catalog(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "public-brand.db"))

    register_response = client.post(
        "/auth/register",
        json={
            "name": "Owner",
            "email": "public@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "Casa Aurora",
            "business_model": "hybrid",
        },
    )
    token = register_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    client.put(
        "/admin/spark",
        headers=headers,
        json={
            "brandName": "Casa Aurora",
            "tone": "inteligente",
            "power": "clareza",
            "voiceStyle": "balanced",
            "actMode": "consultant",
            "businessGoal": "launch",
            "businessDescription": "Marca de casa e decor com novidades frequentes.",
            "theme": {"primaryColor": "#224466", "secondaryColor": "#66aacc"},
            "pageSections": {"showCarousel": False, "showPromotions": True, "showNewArrivals": True},
        },
    )
    client.post(
        "/admin/catalog",
        headers=headers,
        json={
            "name": "Luminaria Alba",
            "description": "Peca principal da selecao.",
            "price": "R$ 289",
            "isFeatured": True,
            "isPromotion": True,
            "isNewArrival": True,
            "availability": "available",
        },
    )

    public_response = client.get("/public/brands/casa-aurora")

    assert public_response.status_code == 200
    body = public_response.json()
    assert body["slug"] == "casa-aurora"
    assert body["spark"]["brandName"] == "Casa Aurora"
    assert body["theme"]["primaryColor"] == "#224466"
    assert body["pageSections"]["showPromotions"] is True
    assert len(body["catalog"]) == 1
    assert body["pageHighlights"]["hasPromotions"] is True


def test_channel_message_uses_public_brand_slug_context(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "public-channel.db"))

    register_response = client.post(
        "/auth/register",
        json={
            "name": "Owner",
            "email": "slug@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "Marca Solar",
            "business_model": "service",
        },
    )
    token = register_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    client.put(
        "/admin/spark",
        headers=headers,
        json={
            "brandName": "Marca Solar",
            "tone": "ousado",
            "power": "atração",
            "voiceStyle": "strong",
            "actMode": "seller",
            "businessGoal": "volume",
            "businessDescription": "Energia solar para casas e empresas.",
        },
    )

    response = client.post(
        "/channel/message",
        json={
            "channel": "web",
            "user_id": "visitor-1",
            "brand_name": "Ignorar Local",
            "tenant_slug": "marca-solar",
            "message": "",
            "persona": {
                "tone": "divertido",
                "power": "conexão",
                "voice_style": "soft",
            },
            "messages": [],
            "context_mode": "customer",
            "metadata": {"intent": "conversation_start"},
        },
    )

    assert response.status_code == 200
    assert response.json()["response"] == "Agora quem responde sou eu. Pode mandar."


def test_forgot_password_returns_same_message_for_existing_and_missing_email(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "forgot-password.db"))

    client.post(
        "/auth/register",
        json={
            "name": "Owner",
            "email": "reset@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "Marca Reset",
            "business_model": "service",
        },
    )

    existing_response = client.post("/auth/forgot-password", json={"email": "reset@example.com"})
    missing_response = client.post("/auth/forgot-password", json={"email": "naoexiste@example.com"})

    assert existing_response.status_code == 200
    assert missing_response.status_code == 200
    assert existing_response.json() == {"message": "Se existir uma conta com este email, enviaremos instruções."}
    assert missing_response.json() == {"message": "Se existir uma conta com este email, enviaremos instruções."}

    user = get_user_by_email("reset@example.com")
    assert user is not None
    token_record = get_latest_password_reset_token_for_user(user["id"])
    assert token_record is not None
    assert token_record["used_at"] is None


def test_reset_password_accepts_valid_token_and_rejects_reuse(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "reset-password.db"))

    client.post(
        "/auth/register",
        json={
            "name": "Owner",
            "email": "reuse@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "Marca Reuso",
            "business_model": "service",
        },
    )
    client.post("/auth/forgot-password", json={"email": "reuse@example.com"})

    user = get_user_by_email("reuse@example.com")
    assert user is not None
    token_record = get_latest_password_reset_token_for_user(user["id"])
    assert token_record is not None

    reset_response = client.post(
        "/auth/reset-password",
        json={"token": token_record["token"], "new_password": "NovaSenhaSegura456"},
    )
    assert reset_response.status_code == 200
    assert reset_response.json() == {"message": "Senha redefinida com sucesso"}

    login_response = client.post(
        "/auth/login",
        json={"email": "reuse@example.com", "password": "NovaSenhaSegura456"},
    )
    assert login_response.status_code == 200

    reused_response = client.post(
        "/auth/reset-password",
        json={"token": token_record["token"], "new_password": "OutraSenha789"},
    )
    assert reused_response.status_code == 400


def test_reset_password_rejects_expired_token(tmp_path, monkeypatch):
    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "expired-reset.db"))

    client.post(
        "/auth/register",
        json={
            "name": "Owner",
            "email": "expired@example.com",
            "password": "SenhaSegura123",
            "tenant_name": "Marca Expirada",
            "business_model": "service",
        },
    )
    client.post("/auth/forgot-password", json={"email": "expired@example.com"})

    user = get_user_by_email("expired@example.com")
    assert user is not None
    token_record = get_latest_password_reset_token_for_user(user["id"])
    assert token_record is not None

    monkeypatch.setenv("BRANDSOUL_DB_PATH", str(tmp_path / "expired-reset.db"))
    from services.auth_store import get_connection

    with get_connection() as connection:
        connection.execute(
            "UPDATE password_reset_tokens SET expires_at = ? WHERE id = ?",
            ("2000-01-01T00:00:00+00:00", token_record["id"]),
        )
        connection.commit()

    expired_response = client.post(
        "/auth/reset-password",
        json={"token": token_record["token"], "new_password": "NovaSenhaSegura456"},
    )
    assert expired_response.status_code == 400
