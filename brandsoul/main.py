import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.auth import AuthResponse, ForgotPasswordRequest, LoginRequest, MessageResponse, RegisterRequest, ResetPasswordRequest, TenantPublic, UserPublic
from models.catalog import CatalogItemPayload
from models.channel import ChannelMessage, ChannelResponse, ChatRequest, ChatResponse
from models.interaction import InteractionRequest, InteractionResponse
from models.public_brand import PublicBrandResponse
from models.spark import SparkPayload
from services.auth_service import (
    get_current_tenant,
    get_current_user,
    login_account,
    request_password_reset,
    register_account,
    reset_password_with_token,
    resolve_token_from_request,
    serialize_tenant,
    serialize_user,
    try_get_authenticated_user,
)
from services.channel_service import handle_channel_message, should_bootstrap_initial_response
from services.catalog_service import (
    create_tenant_catalog_item,
    delete_tenant_catalog_item,
    list_tenant_catalog,
    update_tenant_catalog_item,
)
from services.interaction_service import simulate_interaction
from services.public_brand_service import fetch_public_brand
from services.spark_service import fetch_tenant_spark, save_tenant_spark


DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


def parse_allowed_origins() -> list[str]:
    raw_value = os.getenv("ALLOWED_ORIGINS", "")
    parsed_origins = [origin.strip() for origin in raw_value.split(",") if origin.strip()]
    return parsed_origins or DEFAULT_ALLOWED_ORIGINS


app = FastAPI(title="BrandSoul API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


def ensure_openai_is_configured() -> None:
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured.",
        )


def requires_openai(message: str, messages: list | None, metadata: dict[str, str] | None = None) -> bool:
    return not should_bootstrap_initial_response(message, messages, metadata)


def ensure_admin_access(context_mode: str | None, x_admin_key: str | None, bearer_token: str | None) -> None:
    if context_mode != "admin":
        return

    authenticated_user = try_get_authenticated_user(bearer_token)
    if authenticated_user:
        return

    configured_admin_key = os.getenv("ADMIN_ACCESS_KEY", "").strip()
    if not configured_admin_key or x_admin_key != configured_admin_key:
        raise HTTPException(status_code=403, detail="Admin access denied.")


@app.post("/auth/register", response_model=AuthResponse)
def register(payload: RegisterRequest) -> AuthResponse:
    token, user, tenant = register_account(
        name=payload.name,
        email=payload.email,
        password=payload.password,
        tenant_name=payload.tenant_name,
        business_model=payload.business_model,
    )
    return AuthResponse(token=token, user=user, tenant=tenant)


@app.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    token, user, tenant = login_account(email=payload.email, password=payload.password)
    return AuthResponse(token=token, user=user, tenant=tenant)


@app.post("/auth/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest) -> MessageResponse:
    request_password_reset(email=payload.email)
    return MessageResponse(message="Se existir uma conta com este email, enviaremos instruções.")


@app.post("/auth/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest) -> MessageResponse:
    reset_password_with_token(token=payload.token, new_password=payload.new_password)
    return MessageResponse(message="Senha redefinida com sucesso")


@app.get("/auth/me", response_model=UserPublic)
def auth_me(current_user: dict = Depends(get_current_user)) -> UserPublic:
    return serialize_user(current_user)


@app.get("/tenant/me", response_model=TenantPublic)
def tenant_me(current_tenant: dict = Depends(get_current_tenant)) -> TenantPublic:
    return serialize_tenant(current_tenant)


@app.get("/admin/spark", response_model=SparkPayload)
def admin_spark(current_tenant: dict = Depends(get_current_tenant)) -> SparkPayload:
    return fetch_tenant_spark(current_tenant)


@app.put("/admin/spark", response_model=SparkPayload)
def admin_spark_update(payload: SparkPayload, current_tenant: dict = Depends(get_current_tenant)) -> SparkPayload:
    return save_tenant_spark(current_tenant, payload)


@app.get("/admin/catalog", response_model=list[CatalogItemPayload])
def admin_catalog(current_tenant: dict = Depends(get_current_tenant)) -> list[CatalogItemPayload]:
    return list_tenant_catalog(current_tenant)


@app.post("/admin/catalog", response_model=CatalogItemPayload)
def admin_catalog_create(payload: CatalogItemPayload, current_tenant: dict = Depends(get_current_tenant)) -> CatalogItemPayload:
    return create_tenant_catalog_item(current_tenant, payload)


@app.put("/admin/catalog/{item_id}", response_model=CatalogItemPayload)
def admin_catalog_update(item_id: int, payload: CatalogItemPayload, current_tenant: dict = Depends(get_current_tenant)) -> CatalogItemPayload:
    return update_tenant_catalog_item(current_tenant, item_id, payload)


@app.delete("/admin/catalog/{item_id}")
def admin_catalog_delete(item_id: int, current_tenant: dict = Depends(get_current_tenant)) -> dict[str, str]:
    delete_tenant_catalog_item(current_tenant, item_id)
    return {"status": "ok"}


@app.get("/public/brands/{slug}", response_model=PublicBrandResponse)
def public_brand(slug: str) -> PublicBrandResponse:
    return fetch_public_brand(slug)


@app.post("/channel/message", response_model=ChannelResponse)
def channel_message(
    payload: ChannelMessage,
    x_admin_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> ChannelResponse:
    bearer_token = None
    if authorization and authorization.lower().startswith("bearer "):
        bearer_token = authorization.split(" ", 1)[1].strip()

    ensure_admin_access(payload.context_mode, x_admin_key, bearer_token)

    if requires_openai(payload.message, payload.messages, payload.metadata):
        ensure_openai_is_configured()

    try:
        return handle_channel_message(payload)
    except ValueError as exc:
        status_code = 503 if "OPENAI_API_KEY" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Failed to generate AI response.") from exc


@app.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    if requires_openai(payload.message, payload.messages):
        ensure_openai_is_configured()

    try:
        channel_response = handle_channel_message(
            ChannelMessage(
                channel="web",
                user_id="local-user",
                brand_name=payload.brand_name,
                message=payload.message,
                persona=payload.persona,
                messages=payload.messages,
                metadata={"source": "legacy-chat"},
            )
        )
    except ValueError as exc:
        status_code = 503 if "OPENAI_API_KEY" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Failed to generate AI response.") from exc

    return ChatResponse(response=channel_response.response)


@app.post("/interaction/simulate", response_model=InteractionResponse)
def simulate_centelha_interaction(payload: InteractionRequest) -> InteractionResponse:
    try:
        return simulate_interaction(payload)
    except ValueError as exc:
        status_code = 503 if "OPENAI_API_KEY" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Failed to simulate brand interaction.") from exc
