import base64
import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from models.auth import TenantPublic, UserPublic
from services.auth_store import (
    create_membership,
    create_tenant,
    create_user,
    get_membership_for_user,
    get_tenant_by_id,
    get_tenant_by_slug,
    get_user_by_email,
    get_user_by_id,
)


bearer_scheme = HTTPBearer(auto_error=False)


def get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "brandsoul-dev-secret-change-me")


def get_jwt_algorithm() -> str:
    return "HS256"


def get_access_token_expiry_minutes() -> int:
    raw_value = os.getenv("JWT_EXPIRE_MINUTES", "1440").strip()
    try:
        return max(15, int(raw_value))
    except ValueError:
        return 1440


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"{base64.b64encode(salt).decode()}${base64.b64encode(derived_key).decode()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        encoded_salt, encoded_hash = password_hash.split("$", 1)
        salt = base64.b64decode(encoded_salt.encode())
        expected_hash = base64.b64decode(encoded_hash.encode())
    except Exception:
        return False

    derived_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return hmac.compare_digest(derived_key, expected_hash)


def slugify_tenant_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    slug = slug.strip("-")
    return slug or "marca"


def build_unique_tenant_slug(tenant_name: str) -> str:
    base_slug = slugify_tenant_name(tenant_name)
    candidate = base_slug
    suffix = 1

    while get_tenant_by_slug(candidate):
        suffix += 1
        candidate = f"{base_slug}-{suffix}"

    return candidate


def build_access_token(user_id: int, tenant_id: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "tenant_id": tenant_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=get_access_token_expiry_minutes())).timestamp()),
    }
    header = {"alg": get_jwt_algorithm(), "typ": "JWT"}
    encoded_header = encode_segment(header)
    encoded_payload = encode_segment(payload)
    signature = sign_token(f"{encoded_header}.{encoded_payload}")
    return f"{encoded_header}.{encoded_payload}.{signature}"


def decode_access_token(token: str) -> dict:
    try:
        encoded_header, encoded_payload, received_signature = token.split(".")
        signed_value = f"{encoded_header}.{encoded_payload}"
        expected_signature = sign_token(signed_value)
        if not hmac.compare_digest(received_signature, expected_signature):
            raise ValueError("invalid signature")

        header = decode_segment(encoded_header)
        if header.get("alg") != get_jwt_algorithm():
            raise ValueError("invalid algorithm")

        payload = decode_segment(encoded_payload)
        if int(payload.get("exp", 0)) < int(datetime.now(UTC).timestamp()):
            raise ValueError("token expired")

        return payload
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token.") from exc


def serialize_user(user: dict) -> UserPublic:
    return UserPublic(
        id=user["id"],
        name=user["name"],
        email=user["email"],
        is_active=bool(user["is_active"]),
        created_at=user["created_at"],
        updated_at=user["updated_at"],
    )


def serialize_tenant(tenant: dict) -> TenantPublic:
    return TenantPublic(
        id=tenant["id"],
        name=tenant["name"],
        slug=tenant["slug"],
        business_model=tenant["business_model"],
        plan=tenant["plan"],
        is_active=bool(tenant["is_active"]),
        created_at=tenant["created_at"],
        updated_at=tenant["updated_at"],
    )


def register_account(*, name: str, email: str, password: str, tenant_name: str, business_model: str) -> tuple[str, UserPublic, TenantPublic]:
    if get_user_by_email(email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    tenant_slug = build_unique_tenant_slug(tenant_name)
    user = create_user(name=name.strip(), email=email.strip().lower(), password_hash=hash_password(password))
    tenant = create_tenant(name=tenant_name.strip(), slug=tenant_slug, business_model=business_model)
    create_membership(user_id=user["id"], tenant_id=tenant["id"], role="owner")

    token = build_access_token(user["id"], tenant["id"])
    return token, serialize_user(user), serialize_tenant(tenant)


def login_account(*, email: str, password: str) -> tuple[str, UserPublic, TenantPublic]:
    user = get_user_by_email(email.strip().lower())
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    membership = get_membership_for_user(user["id"])
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found.")

    tenant = get_tenant_by_id(membership["tenant_id"])
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")

    token = build_access_token(user["id"], tenant["id"])
    return token, serialize_user(user), serialize_tenant(tenant)


def resolve_token_from_request(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    authorization: str | None = Header(default=None),
) -> str:
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials

    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")


def get_current_user(token: str = Depends(resolve_token_from_request)) -> dict:
    payload = decode_access_token(token)
    user_id = int(payload["sub"])
    user = get_user_by_id(user_id)
    if not user or not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not available.")

    return user


def get_current_tenant(user: dict = Depends(get_current_user), token: str = Depends(resolve_token_from_request)) -> dict:
    payload = decode_access_token(token)
    tenant_id = int(payload["tenant_id"])
    tenant = get_tenant_by_id(tenant_id)
    membership = get_membership_for_user(user["id"])
    if not tenant or not tenant["is_active"] or not membership or membership["tenant_id"] != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied.")

    return tenant


def try_get_authenticated_user(token: str | None) -> dict | None:
    if not token:
        return None

    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
        user = get_user_by_id(user_id)
        if not user or not user["is_active"]:
            return None
        return user
    except HTTPException:
        return None


def encode_segment(value: dict) -> str:
    raw_bytes = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw_bytes).decode("utf-8").rstrip("=")


def decode_segment(value: str) -> dict:
    padding = "=" * (-len(value) % 4)
    decoded_bytes = base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))
    return json.loads(decoded_bytes.decode("utf-8"))


def sign_token(value: str) -> str:
    digest = hmac.new(get_jwt_secret().encode("utf-8"), value.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
