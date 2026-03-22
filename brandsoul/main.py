import os

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.channel import ChannelMessage, ChannelResponse, ChatRequest, ChatResponse
from models.interaction import InteractionRequest, InteractionResponse
from services.channel_service import handle_channel_message, should_bootstrap_initial_response
from services.interaction_service import simulate_interaction


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


def ensure_admin_access(context_mode: str | None, x_admin_key: str | None) -> None:
    if context_mode != "admin":
        return

    configured_admin_key = os.getenv("ADMIN_ACCESS_KEY", "").strip()
    if not configured_admin_key or x_admin_key != configured_admin_key:
        raise HTTPException(status_code=403, detail="Admin access denied.")


@app.post("/channel/message", response_model=ChannelResponse)
def channel_message(payload: ChannelMessage, x_admin_key: str | None = Header(default=None)) -> ChannelResponse:
    ensure_admin_access(payload.context_mode, x_admin_key)

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
