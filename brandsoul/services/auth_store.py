import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "brandsoul.db"
_initialized_paths: set[str] = set()


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def get_database_path() -> Path:
    configured_path = os.getenv("BRANDSOUL_DB_PATH", "").strip()
    if configured_path:
        return Path(configured_path).expanduser().resolve()

    return DEFAULT_DB_PATH


def get_connection() -> sqlite3.Connection:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    initialize_database(connection, str(database_path))
    return connection


def initialize_database(connection: sqlite3.Connection, database_key: str) -> None:
    if database_key in _initialized_paths:
        return

    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tenants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            business_model TEXT NOT NULL,
            plan TEXT NOT NULL DEFAULT 'starter',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS memberships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tenant_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_user_tenant
        ON memberships(user_id, tenant_id);

        CREATE TABLE IF NOT EXISTS sparks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL UNIQUE,
            brand_name TEXT NOT NULL,
            logo TEXT,
            tone TEXT NOT NULL,
            power TEXT NOT NULL,
            business_model TEXT NOT NULL DEFAULT 'product',
            brand_type TEXT NOT NULL DEFAULT 'business',
            features_json TEXT,
            voice_style TEXT NOT NULL,
            act_mode TEXT NOT NULL,
            business_goal TEXT NOT NULL,
            modes_json TEXT,
            emergency_type TEXT,
            service_offers_json TEXT,
            scheduling_config_json TEXT,
            professional_data_json TEXT,
            business_description TEXT,
            institutional_image TEXT,
            theme_json TEXT,
            page_sections_json TEXT,
            carousel_images_json TEXT,
            opening_hours_json TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            delivery_available INTEGER,
            business_hours TEXT,
            service_region TEXT,
            brand_highlight TEXT,
            whatsapp TEXT,
            email TEXT,
            instagram TEXT,
            facebook TEXT,
            tiktok TEXT,
            site TEXT,
            contact_info TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS catalog_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            category TEXT,
            description TEXT NOT NULL,
            price TEXT,
            highlight TEXT,
            stock INTEGER,
            availability TEXT,
            image TEXT,
            images_json TEXT,
            priority TEXT,
            is_featured INTEGER NOT NULL DEFAULT 0,
            is_promotion INTEGER NOT NULL DEFAULT 0,
            is_new_arrival INTEGER NOT NULL DEFAULT 0,
            complements_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
        ON password_reset_tokens(user_id);
        """
    )
    ensure_table_columns(
        connection,
        "sparks",
        {
            "business_model": "TEXT NOT NULL DEFAULT 'product'",
            "brand_type": "TEXT NOT NULL DEFAULT 'business'",
            "features_json": "TEXT",
            "modes_json": "TEXT",
            "emergency_type": "TEXT",
            "service_offers_json": "TEXT",
            "scheduling_config_json": "TEXT",
            "professional_data_json": "TEXT",
        },
    )
    connection.commit()
    _initialized_paths.add(database_key)


def ensure_table_columns(connection: sqlite3.Connection, table_name: str, columns: dict[str, str]) -> None:
    existing_columns = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }

    for column_name, column_definition in columns.items():
        if column_name in existing_columns:
            continue

        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}")


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None

    return dict(row)


def create_user(*, name: str, email: str, password_hash: str) -> dict:
    now = utcnow_iso()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO users (name, email, password_hash, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?)
            """,
            (name, email.lower(), password_hash, now, now),
        )
        connection.commit()
        return get_user_by_id(cursor.lastrowid, connection=connection) or {}


def create_tenant(*, name: str, slug: str, business_model: str, plan: str = "starter") -> dict:
    now = utcnow_iso()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO tenants (name, slug, business_model, plan, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            """,
            (name, slug, business_model, plan, now, now),
        )
        connection.commit()
        return get_tenant_by_id(cursor.lastrowid, connection=connection) or {}


def create_membership(*, user_id: int, tenant_id: int, role: str) -> dict:
    now = utcnow_iso()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO memberships (user_id, tenant_id, role, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, tenant_id, role, now),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM memberships WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return row_to_dict(row) or {}


def get_user_by_email(email: str, *, connection: sqlite3.Connection | None = None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        row = connection.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()
        return row_to_dict(row)
    finally:
        if owns_connection:
            connection.close()


def get_user_by_id(user_id: int, *, connection: sqlite3.Connection | None = None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return row_to_dict(row)
    finally:
        if owns_connection:
            connection.close()


def update_user_password(*, user_id: int, password_hash: str) -> dict | None:
    now = utcnow_iso()
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE users
            SET password_hash = ?, updated_at = ?
            WHERE id = ?
            """,
            (password_hash, now, user_id),
        )
        connection.commit()
        return get_user_by_id(user_id, connection=connection)


def get_tenant_by_slug(slug: str, *, connection: sqlite3.Connection | None = None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        row = connection.execute("SELECT * FROM tenants WHERE slug = ?", (slug,)).fetchone()
        return row_to_dict(row)
    finally:
        if owns_connection:
            connection.close()


def get_tenant_by_id(tenant_id: int, *, connection: sqlite3.Connection | None = None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        row = connection.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
        return row_to_dict(row)
    finally:
        if owns_connection:
            connection.close()


def get_membership_for_user(user_id: int, *, connection: sqlite3.Connection | None = None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        row = connection.execute(
            """
            SELECT * FROM memberships
            WHERE user_id = ?
            ORDER BY id ASC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
        return row_to_dict(row)
    finally:
        if owns_connection:
            connection.close()


def create_password_reset_token(*, user_id: int, token: str, expires_at: str) -> dict:
    now = utcnow_iso()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO password_reset_tokens (user_id, token, expires_at, used_at, created_at)
            VALUES (?, ?, ?, NULL, ?)
            """,
            (user_id, token, expires_at, now),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM password_reset_tokens WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return row_to_dict(row) or {}


def get_password_reset_token_by_token(token: str, *, connection: sqlite3.Connection | None = None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        row = connection.execute(
            "SELECT * FROM password_reset_tokens WHERE token = ?",
            (token,),
        ).fetchone()
        return row_to_dict(row)
    finally:
        if owns_connection:
            connection.close()


def get_latest_password_reset_token_for_user(user_id: int, *, connection: sqlite3.Connection | None = None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        row = connection.execute(
            """
            SELECT * FROM password_reset_tokens
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
        return row_to_dict(row)
    finally:
        if owns_connection:
            connection.close()


def mark_password_reset_token_used(*, token_id: int) -> dict | None:
    used_at = utcnow_iso()
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = ?
            WHERE id = ?
            """,
            (used_at, token_id),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM password_reset_tokens WHERE id = ?", (token_id,)).fetchone()
        return row_to_dict(row)


def get_spark_by_tenant_id(tenant_id: int, *, connection: sqlite3.Connection | None = None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        row = connection.execute("SELECT * FROM sparks WHERE tenant_id = ?", (tenant_id,)).fetchone()
        return row_to_dict(row)
    finally:
        if owns_connection:
            connection.close()


def upsert_spark(*, tenant_id: int, spark_payload: dict) -> dict:
    now = utcnow_iso()
    with get_connection() as connection:
        existing = get_spark_by_tenant_id(tenant_id, connection=connection)
        if existing:
            connection.execute(
                """
                UPDATE sparks
                SET brand_name = ?, logo = ?, tone = ?, power = ?, business_model = ?, brand_type = ?, features_json = ?, voice_style = ?, act_mode = ?, business_goal = ?,
                    modes_json = ?, emergency_type = ?, service_offers_json = ?, scheduling_config_json = ?, professional_data_json = ?, business_description = ?, institutional_image = ?, theme_json = ?, page_sections_json = ?,
                    carousel_images_json = ?, opening_hours_json = ?, address = ?, city = ?, state = ?,
                    delivery_available = ?, business_hours = ?, service_region = ?, brand_highlight = ?,
                    whatsapp = ?, email = ?, instagram = ?, facebook = ?, tiktok = ?, site = ?, contact_info = ?,
                    updated_at = ?
                WHERE tenant_id = ?
                """,
                (
                    spark_payload["brand_name"],
                    spark_payload.get("logo"),
                    spark_payload["tone"],
                    spark_payload["power"],
                    spark_payload.get("business_model", "product"),
                    spark_payload.get("brand_type", "business"),
                    spark_payload.get("features_json"),
                    spark_payload["voice_style"],
                    spark_payload["act_mode"],
                    spark_payload["business_goal"],
                    spark_payload.get("modes_json"),
                    spark_payload.get("emergency_type"),
                    spark_payload.get("service_offers_json"),
                    spark_payload.get("scheduling_config_json"),
                    spark_payload.get("professional_data_json"),
                    spark_payload.get("business_description"),
                    spark_payload.get("institutional_image"),
                    spark_payload.get("theme_json"),
                    spark_payload.get("page_sections_json"),
                    spark_payload.get("carousel_images_json"),
                    spark_payload.get("opening_hours_json"),
                    spark_payload.get("address"),
                    spark_payload.get("city"),
                    spark_payload.get("state"),
                    spark_payload.get("delivery_available"),
                    spark_payload.get("business_hours"),
                    spark_payload.get("service_region"),
                    spark_payload.get("brand_highlight"),
                    spark_payload.get("whatsapp"),
                    spark_payload.get("email"),
                    spark_payload.get("instagram"),
                    spark_payload.get("facebook"),
                    spark_payload.get("tiktok"),
                    spark_payload.get("site"),
                    spark_payload.get("contact_info"),
                    now,
                    tenant_id,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO sparks (
                    tenant_id, brand_name, logo, tone, power, business_model, brand_type, features_json, voice_style, act_mode, business_goal,
                    modes_json, emergency_type, service_offers_json, scheduling_config_json, professional_data_json, business_description, institutional_image, theme_json, page_sections_json,
                    carousel_images_json, opening_hours_json, address, city, state, delivery_available,
                    business_hours, service_region, brand_highlight, whatsapp, email, instagram,
                    facebook, tiktok, site, contact_info, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tenant_id,
                    spark_payload["brand_name"],
                    spark_payload.get("logo"),
                    spark_payload["tone"],
                    spark_payload["power"],
                    spark_payload.get("business_model", "product"),
                    spark_payload.get("brand_type", "business"),
                    spark_payload.get("features_json"),
                    spark_payload["voice_style"],
                    spark_payload["act_mode"],
                    spark_payload["business_goal"],
                    spark_payload.get("modes_json"),
                    spark_payload.get("emergency_type"),
                    spark_payload.get("service_offers_json"),
                    spark_payload.get("scheduling_config_json"),
                    spark_payload.get("professional_data_json"),
                    spark_payload.get("business_description"),
                    spark_payload.get("institutional_image"),
                    spark_payload.get("theme_json"),
                    spark_payload.get("page_sections_json"),
                    spark_payload.get("carousel_images_json"),
                    spark_payload.get("opening_hours_json"),
                    spark_payload.get("address"),
                    spark_payload.get("city"),
                    spark_payload.get("state"),
                    spark_payload.get("delivery_available"),
                    spark_payload.get("business_hours"),
                    spark_payload.get("service_region"),
                    spark_payload.get("brand_highlight"),
                    spark_payload.get("whatsapp"),
                    spark_payload.get("email"),
                    spark_payload.get("instagram"),
                    spark_payload.get("facebook"),
                    spark_payload.get("tiktok"),
                    spark_payload.get("site"),
                    spark_payload.get("contact_info"),
                    now,
                    now,
                ),
            )
        connection.commit()
        return get_spark_by_tenant_id(tenant_id, connection=connection) or {}


def list_catalog_items_by_tenant_id(tenant_id: int, *, connection: sqlite3.Connection | None = None) -> list[dict]:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        rows = connection.execute(
            """
            SELECT * FROM catalog_items
            WHERE tenant_id = ?
            ORDER BY id ASC
            """,
            (tenant_id,),
        ).fetchall()
        return [row_to_dict(row) or {} for row in rows]
    finally:
        if owns_connection:
            connection.close()


def get_catalog_item_by_id(item_id: int, *, connection: sqlite3.Connection | None = None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        row = connection.execute("SELECT * FROM catalog_items WHERE id = ?", (item_id,)).fetchone()
        return row_to_dict(row)
    finally:
        if owns_connection:
            connection.close()


def create_catalog_item(*, tenant_id: int, item_payload: dict) -> dict:
    now = utcnow_iso()
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO catalog_items (
                tenant_id, name, category, description, price, highlight, stock, availability, image,
                images_json, priority, is_featured, is_promotion, is_new_arrival, complements_json,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tenant_id,
                item_payload["name"],
                item_payload.get("category"),
                item_payload["description"],
                item_payload.get("price"),
                item_payload.get("highlight"),
                item_payload.get("stock"),
                item_payload.get("availability"),
                item_payload.get("image"),
                item_payload.get("images_json"),
                item_payload.get("priority"),
                item_payload.get("is_featured", 0),
                item_payload.get("is_promotion", 0),
                item_payload.get("is_new_arrival", 0),
                item_payload.get("complements_json"),
                now,
                now,
            ),
        )
        connection.commit()
        return get_catalog_item_by_id(cursor.lastrowid, connection=connection) or {}


def update_catalog_item(*, item_id: int, tenant_id: int, item_payload: dict) -> dict | None:
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT * FROM catalog_items WHERE id = ? AND tenant_id = ?",
            (item_id, tenant_id),
        ).fetchone()
        if not existing:
            return None

        connection.execute(
            """
            UPDATE catalog_items
            SET name = ?, category = ?, description = ?, price = ?, highlight = ?, stock = ?, availability = ?,
                image = ?, images_json = ?, priority = ?, is_featured = ?, is_promotion = ?, is_new_arrival = ?,
                complements_json = ?, updated_at = ?
            WHERE id = ? AND tenant_id = ?
            """,
            (
                item_payload["name"],
                item_payload.get("category"),
                item_payload["description"],
                item_payload.get("price"),
                item_payload.get("highlight"),
                item_payload.get("stock"),
                item_payload.get("availability"),
                item_payload.get("image"),
                item_payload.get("images_json"),
                item_payload.get("priority"),
                item_payload.get("is_featured", 0),
                item_payload.get("is_promotion", 0),
                item_payload.get("is_new_arrival", 0),
                item_payload.get("complements_json"),
                utcnow_iso(),
                item_id,
                tenant_id,
            ),
        )
        connection.commit()
        return get_catalog_item_by_id(item_id, connection=connection)


def delete_catalog_item(*, item_id: int, tenant_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM catalog_items WHERE id = ? AND tenant_id = ?",
            (item_id, tenant_id),
        )
        connection.commit()
        return cursor.rowcount > 0
