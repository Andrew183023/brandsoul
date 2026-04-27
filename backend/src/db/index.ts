import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createDatabaseConnection as createClientConnection,
  ensureColumn,
  ensureIndexes,
  splitSqlStatements,
  toPostgresCreateTable,
  type BackendDatabase,
  type DatabaseConfig,
} from './dbClient.js'

const sqliteSchema = `
  CREATE TABLE IF NOT EXISTS entity_profile (
    id TEXT PRIMARY KEY,
    owner_id TEXT,
    owner_user_id INTEGER,
    owner_tenant_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    entity_profile TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entity_event_log (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    caused_by_command_id TEXT
  );

  CREATE TABLE IF NOT EXISTS entity_exports (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    format TEXT NOT NULL,
    created_at TEXT NOT NULL,
    metadata TEXT NOT NULL,
    file_url TEXT
  );

  CREATE TABLE IF NOT EXISTS orchestrator_snapshot (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    session_id TEXT,
    version INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    current_stage TEXT,
    session_status TEXT NOT NULL,
    relational_snapshot TEXT NOT NULL,
    render_snapshot TEXT NOT NULL,
    last_command_id TEXT,
    last_command_type TEXT,
    last_command_issued_at TEXT,
    last_command_source TEXT,
    last_event_id TEXT,
    last_event_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entity_relationships (
    id TEXT PRIMARY KEY,
    source_entity_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    strength REAL NOT NULL,
    last_interaction_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS global_feed (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    owner_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    relevance_score REAL NOT NULL,
    visibility TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entity_social_signals (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    owner_id TEXT,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    weight REAL NOT NULL,
    source TEXT,
    actor_id TEXT,
    metadata TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS job_queue (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    payload TEXT NOT NULL,
    result TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    retry_count INTEGER NOT NULL DEFAULT 0,
    available_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    last_duration_ms INTEGER,
    trace_id TEXT,
    entity_id TEXT
  );

  CREATE TABLE IF NOT EXISTS billing_subscription (
    user_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    plan_type TEXT NOT NULL,
    subscription_state TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT,
    PRIMARY KEY (user_id, tenant_id)
  );

  CREATE TABLE IF NOT EXISTS monetization_usage (
    entity_id TEXT PRIMARY KEY,
    owner_user_id INTEGER NOT NULL,
    owner_tenant_id INTEGER NOT NULL,
    messages_count INTEGER NOT NULL DEFAULT 0,
    exports_count INTEGER NOT NULL DEFAULT 0,
    social_interactions INTEGER NOT NULL DEFAULT 0,
    flowmind_actions INTEGER NOT NULL DEFAULT 0,
    memory_usage INTEGER NOT NULL DEFAULT 0,
    entities_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS growth_event_log (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    owner_id TEXT,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    actor_id TEXT,
    referral_id TEXT,
    metadata TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS referral_state (
    id TEXT PRIMARY KEY,
    owner_id TEXT,
    inviter_entity_id TEXT NOT NULL,
    invited_user_id TEXT,
    invited_identifier TEXT,
    conversion_status TEXT NOT NULL,
    invite_sent_at TEXT NOT NULL,
    invite_accepted_at TEXT,
    converted_at TEXT,
    created_entity_id TEXT,
    metadata TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entity_relational_trace (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    command_id TEXT,
    event_type TEXT NOT NULL,
    event_id TEXT NOT NULL,
    actor_id TEXT,
    occurred_at TEXT NOT NULL,
    topic TEXT,
    intent TEXT,
    interaction_type TEXT,
    delta_binding_strength REAL NOT NULL,
    delta_xp REAL NOT NULL,
    delta_continuity_confidence REAL NOT NULL DEFAULT 0,
    delta_return_count INTEGER NOT NULL,
    delta_share_count INTEGER NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entity_cognitive_memory (
    entity_id TEXT PRIMARY KEY,
    memory_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_refresh_session (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    parent_session_id TEXT,
    user_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    token_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    revoke_reason TEXT,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_used_at TEXT,
    rotated_at TEXT,
    revoked_at TEXT,
    created_by_ip TEXT,
    created_by_user_agent TEXT,
    last_used_ip TEXT,
    last_used_user_agent TEXT,
    replaced_by_session_id TEXT,
    auth_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_session_id) REFERENCES auth_refresh_session(id) ON DELETE SET NULL,
    FOREIGN KEY (replaced_by_session_id) REFERENCES auth_refresh_session(id) ON DELETE SET NULL,
    CHECK (status IN ('active', 'rotated', 'revoked', 'expired', 'reuse_detected')),
    CHECK (
      revoke_reason IS NULL
      OR revoke_reason IN ('logout', 'logout_global', 'reuse_detected', 'security_incident', 'admin_revoked', 'expired', 'rotated')
    ),
    CHECK (expires_at > issued_at),
    CHECK (replaced_by_session_id IS NULL OR replaced_by_session_id <> id)
  );

  CREATE TABLE IF NOT EXISTS auth_signing_key (
    id TEXT PRIMARY KEY,
    kid TEXT NOT NULL UNIQUE,
    algorithm TEXT NOT NULL,
    status TEXT NOT NULL,
    public_key_pem TEXT NOT NULL,
    private_key_ref TEXT NOT NULL,
    not_before TEXT NOT NULL,
    activates_at TEXT NOT NULL,
    retires_at TEXT,
    expires_at TEXT,
    issued_token_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    rotation_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (algorithm IN ('RS256')),
    CHECK (status IN ('pending', 'active', 'verifying', 'retired', 'revoked')),
    CHECK (activates_at >= not_before),
    CHECK (retires_at IS NULL OR retires_at >= activates_at),
    CHECK (expires_at IS NULL OR expires_at >= activates_at)
  );

  CREATE TABLE IF NOT EXISTS auth_access_audit (
    id TEXT PRIMARY KEY,
    jti TEXT NOT NULL UNIQUE,
    session_id TEXT,
    user_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    kid TEXT NOT NULL,
    token_version INTEGER NOT NULL,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    audience TEXT NOT NULL,
    issuer TEXT NOT NULL,
    issued_by_flow TEXT NOT NULL,
    issued_by_ip TEXT,
    issued_by_user_agent TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES auth_refresh_session(id) ON DELETE SET NULL,
    CHECK (issued_by_flow IN ('login', 'refresh', 'service_exchange', 'admin_issue')),
    CHECK (expires_at > issued_at)
  );
`

const indexStatements = [
  'CREATE INDEX IF NOT EXISTS idx_entity_profile_owner_id ON entity_profile(owner_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_profile_owner_user_id ON entity_profile(owner_user_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_profile_updated_at ON entity_profile(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_event_log_entity_id ON entity_event_log(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_event_log_timestamp ON entity_event_log(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_entity_event_log_entity_id_timestamp ON entity_event_log(entity_id, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_entity_exports_entity_id ON entity_exports(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_exports_created_at ON entity_exports(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_exports_entity_id_created_at ON entity_exports(entity_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_orchestrator_snapshot_entity_id ON orchestrator_snapshot(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_orchestrator_snapshot_created_at ON orchestrator_snapshot(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_orchestrator_snapshot_entity_id_created_at ON orchestrator_snapshot(entity_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_relationships_source_entity_id ON entity_relationships(source_entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_relationships_target_entity_id ON entity_relationships(target_entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_relationships_source_target ON entity_relationships(source_entity_id, target_entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_relationships_relation_type ON entity_relationships(relation_type)',
  'CREATE INDEX IF NOT EXISTS idx_global_feed_timestamp ON global_feed(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_global_feed_entity_id ON global_feed(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_global_feed_owner_id ON global_feed(owner_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_social_signals_entity_id ON entity_social_signals(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_social_signals_owner_id ON entity_social_signals(owner_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_social_signals_timestamp ON entity_social_signals(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_entity_social_signals_entity_timestamp ON entity_social_signals(entity_id, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_job_queue_status_available_at ON job_queue(status, available_at)',
  'CREATE INDEX IF NOT EXISTS idx_job_queue_type_created_at ON job_queue(type, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_job_queue_entity_id ON job_queue(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_billing_subscription_plan_type ON billing_subscription(plan_type)',
  'CREATE INDEX IF NOT EXISTS idx_monetization_usage_owner ON monetization_usage(owner_user_id, owner_tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_growth_event_log_entity_id ON growth_event_log(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_growth_event_log_owner_id ON growth_event_log(owner_id)',
  'CREATE INDEX IF NOT EXISTS idx_growth_event_log_type_timestamp ON growth_event_log(type, timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_referral_state_owner_id ON referral_state(owner_id)',
  'CREATE INDEX IF NOT EXISTS idx_referral_state_inviter_entity_id ON referral_state(inviter_entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_referral_state_status ON referral_state(conversion_status)',
  'CREATE INDEX IF NOT EXISTS idx_entity_relational_trace_entity_id ON entity_relational_trace(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_relational_trace_command_id ON entity_relational_trace(command_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_relational_trace_event_id ON entity_relational_trace(event_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_relational_trace_occurred_at ON entity_relational_trace(occurred_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_relational_trace_entity_occurred_at ON entity_relational_trace(entity_id, occurred_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_cognitive_memory_updated_at ON entity_cognitive_memory(updated_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_refresh_session_token_hash ON auth_refresh_session(token_hash)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_refresh_session_token_fingerprint ON auth_refresh_session(token_fingerprint)',
  'CREATE INDEX IF NOT EXISTS idx_auth_refresh_session_user_tenant_status ON auth_refresh_session(user_id, tenant_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_auth_refresh_session_family_id ON auth_refresh_session(family_id)',
  'CREATE INDEX IF NOT EXISTS idx_auth_refresh_session_parent_session_id ON auth_refresh_session(parent_session_id)',
  'CREATE INDEX IF NOT EXISTS idx_auth_refresh_session_expires_at ON auth_refresh_session(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_auth_refresh_session_replaced_by_session_id ON auth_refresh_session(replaced_by_session_id)',
  'CREATE INDEX IF NOT EXISTS idx_auth_signing_key_status ON auth_signing_key(status)',
  'CREATE INDEX IF NOT EXISTS idx_auth_signing_key_activates_at ON auth_signing_key(activates_at)',
  'CREATE INDEX IF NOT EXISTS idx_auth_signing_key_retires_at ON auth_signing_key(retires_at)',
  'CREATE INDEX IF NOT EXISTS idx_auth_access_audit_user_tenant ON auth_access_audit(user_id, tenant_id, issued_at)',
  'CREATE INDEX IF NOT EXISTS idx_auth_access_audit_session_id ON auth_access_audit(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_auth_access_audit_kid ON auth_access_audit(kid)',
  'CREATE INDEX IF NOT EXISTS idx_auth_access_audit_issued_at ON auth_access_audit(issued_at)',
]

export function getDatabaseConfig(): DatabaseConfig {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

  return {
    provider: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
    connectionString: process.env.DATABASE_URL,
    sqliteFile: process.env.SQLITE_FILE ?? path.join(rootDir, 'data', 'brandsoul.sqlite'),
  }
}

export async function createDatabaseConnection(config = getDatabaseConfig()): Promise<BackendDatabase> {
  return createClientConnection(config)
}

async function initializeBaseSchema(db: BackendDatabase) {
  if (db.dialect === 'postgres') {
    for (const statement of splitSqlStatements(toPostgresCreateTable(sqliteSchema))) {
      await db.exec(statement)
    }
    return
  }

  await db.exec(sqliteSchema)
}

export async function initializeDatabase(db: BackendDatabase) {
  await initializeBaseSchema(db)

  await ensureColumn(db, 'entity_event_log', 'caused_by_command_id', 'TEXT')
  await ensureColumn(db, 'entity_profile', 'owner_user_id', 'INTEGER')
  await ensureColumn(db, 'entity_profile', 'owner_tenant_id', 'INTEGER')
  await ensureColumn(db, 'entity_relational_trace', 'delta_continuity_confidence', 'REAL NOT NULL DEFAULT 0')
  await ensureColumn(db, 'orchestrator_snapshot', 'last_command_id', 'TEXT')
  await ensureColumn(db, 'orchestrator_snapshot', 'last_command_type', 'TEXT')
  await ensureColumn(db, 'orchestrator_snapshot', 'last_command_issued_at', 'TEXT')
  await ensureColumn(db, 'orchestrator_snapshot', 'last_command_source', 'TEXT')
  await ensureIndexes(db, indexStatements)
}

export type { BackendDatabase, DatabaseConfig } from './dbClient.js'
