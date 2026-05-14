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
import {
  migrateAdaptiveEquilibriumEvidenceSchema,
  validateAdaptiveEquilibriumEvidenceSchema,
} from './adaptiveEvidenceSchemaMigration.js'

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

  CREATE TABLE IF NOT EXISTS entity_orchestrator_registry (
    entity_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    market TEXT NOT NULL,
    lifecycle_state TEXT NOT NULL,
    autonomy_level TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    memory_status TEXT NOT NULL,
    active_goals_json TEXT NOT NULL,
    operating_constraints_json TEXT NOT NULL,
    health_score REAL NOT NULL,
    lead_generation_score REAL NOT NULL,
    memory_confidence REAL NOT NULL,
    autonomy_readiness REAL NOT NULL,
    risk_score REAL NOT NULL,
    action_queue_json TEXT NOT NULL,
    last_decision_snapshot_json TEXT,
    rollback_state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entity_orchestrator_approval_queue (
    approval_id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    status TEXT NOT NULL,
    rationale TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    proposal_hash TEXT,
    payload_hash TEXT,
    risk_level TEXT,
    requested_at TEXT NOT NULL,
    expires_at TEXT,
    resolved_at TEXT,
    resolved_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
  );

  CREATE TABLE IF NOT EXISTS entity_portfolio_lead_signal (
    signal_id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    market TEXT NOT NULL,
    source TEXT NOT NULL,
    intent TEXT NOT NULL,
    urgency TEXT NOT NULL,
    estimated_value REAL NOT NULL,
    confidence REAL NOT NULL,
    recommended_action TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (urgency IN ('low', 'medium', 'high', 'critical'))
  );

  CREATE TABLE IF NOT EXISTS entity_portfolio_lead (
    lead_id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    signal_id TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    routing_status TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'routed',
    qualified_at TEXT,
    contacted_at TEXT,
    converted_at TEXT,
    lost_at TEXT,
    revenue_amount REAL,
    lost_reason TEXT,
    attributed_command_id TEXT NOT NULL,
    attribution_json TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (routing_status IN ('stored', 'intake_requested', 'outreach_requested')),
    CHECK (status IN ('routed', 'qualified', 'contacted', 'converted', 'lost')),
    FOREIGN KEY (signal_id) REFERENCES entity_portfolio_lead_signal(signal_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS entity_portfolio_lead_intake (
    intake_id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL UNIQUE,
    entity_id TEXT NOT NULL,
    signal_id TEXT NOT NULL,
    source TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    attributed_command_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (lead_id) REFERENCES entity_portfolio_lead(lead_id) ON DELETE CASCADE,
    FOREIGN KEY (signal_id) REFERENCES entity_portfolio_lead_signal(signal_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS entity_portfolio_lead_revenue_event (
    revenue_event_id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL UNIQUE,
    entity_id TEXT NOT NULL,
    invoice_id TEXT,
    payment_id TEXT,
    contract_id TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    validation_method TEXT NOT NULL,
    external_system TEXT,
    validation_reference TEXT,
    confirmed_event_id TEXT,
    reconciliation_status TEXT NOT NULL,
    reconciled_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (validation_method IN ('external_system', 'event_confirmation')),
    CHECK (reconciliation_status IN ('reconciled')),
    FOREIGN KEY (lead_id) REFERENCES entity_portfolio_lead(lead_id) ON DELETE CASCADE,
    FOREIGN KEY (confirmed_event_id) REFERENCES entity_event_log(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS entity_portfolio_proposal (
    proposal_id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    market TEXT NOT NULL,
    proposal_type TEXT NOT NULL,
    status TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    priority_score REAL NOT NULL,
    rationale TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (status IN ('proposed', 'acknowledged', 'approved', 'rejected', 'expired', 'executed', 'evaluated')),
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))
  );

  CREATE TABLE IF NOT EXISTS entity_portfolio_proposal_outcome (
    proposal_id TEXT PRIMARY KEY,
    leads_generated REAL NOT NULL,
    conversions REAL NOT NULL,
    revenue REAL NOT NULL,
    roi_observed REAL NOT NULL,
    success INTEGER NOT NULL,
    evaluated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (proposal_id) REFERENCES entity_portfolio_proposal(proposal_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS flowmind_decision_journal (
    command_id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    decision_hash TEXT NOT NULL,
    decision_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flowmind_execution_ledger (
    command_id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    decision_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    committed_at TEXT,
    snapshot_id TEXT,
    last_event_id TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (status IN ('pending', 'committed', 'rolled_back', 'failed'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_opportunities (
    id TEXT PRIMARY KEY,
    market_signal_id TEXT NOT NULL,
    keyword TEXT NOT NULL,
    category TEXT NOT NULL,
    economic_relevance REAL NOT NULL,
    lead_probability TEXT NOT NULL,
    opportunity_score REAL NOT NULL,
    detected_at TEXT NOT NULL,
    top_entity_id TEXT,
    top_entity_name TEXT,
    confidence REAL,
    suggested_action TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (lead_probability IN ('low', 'medium', 'high')),
    CHECK (category IN ('legal', 'real_estate', 'finance', 'logistics', 'commerce', 'ai', 'agro', 'general', 'noise'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_opportunity_proposals (
    proposal_id TEXT PRIMARY KEY,
    source_opportunity_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    reasoning TEXT NOT NULL,
    governance_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    approved_at TEXT,
    rejected_at TEXT,
    updated_at TEXT NOT NULL,
    CHECK (governance_status IN ('pending', 'approved', 'rejected'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_sovereign_executions (
    execution_id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    execution_status TEXT NOT NULL,
    generated_lead_id TEXT,
    revenue_attributed REAL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    result_summary TEXT,
    CHECK (execution_status IN ('pending', 'running', 'completed', 'failed'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_revenue_attribution (
    attribution_id TEXT PRIMARY KEY,
    market_signal_id TEXT NOT NULL,
    opportunity_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    lead_id TEXT NOT NULL,
    revenue_event_id TEXT,
    attributed_revenue REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flowmind_learning_ledger (
    learning_event_id TEXT PRIMARY KEY,
    attribution_id TEXT NOT NULL,
    market_signal_id TEXT NOT NULL,
    opportunity_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    category TEXT NOT NULL,
    signal_keyword TEXT NOT NULL,
    outcome_type TEXT NOT NULL,
    attributed_revenue REAL NOT NULL,
    conversion_success INTEGER NOT NULL,
    observed_at TEXT NOT NULL,
    CHECK (outcome_type IN ('revenue_positive', 'revenue_negative', 'conversion_positive', 'conversion_negative')),
    CHECK (conversion_success IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS flowmind_learning_checkpoint (
    checkpoint_id TEXT PRIMARY KEY,
    runtime_name TEXT NOT NULL,
    last_processed_attribution_id TEXT,
    last_processed_attributed_at TEXT,
    checkpoint_version INTEGER NOT NULL DEFAULT 1,
    lineage_key TEXT,
    lineage_metadata_json TEXT,
    checkpoint_payload_json TEXT,
    continuity_fingerprint TEXT,
    checkpoint_attestation_state TEXT,
    attestation_lineage_hash TEXT,
    replay_verification_metadata_json TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flowmind_negative_outcomes (
    outcome_id TEXT PRIMARY KEY,
    outcome_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    market_signal_id TEXT NOT NULL,
    opportunity_id TEXT NOT NULL,
    proposal_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    category TEXT NOT NULL,
    signal_keyword TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    metadata_json TEXT
  );

  CREATE TABLE IF NOT EXISTS flowmind_negative_attribution (
    attribution_id TEXT PRIMARY KEY,
    outcome_id TEXT NOT NULL,
    signal_id TEXT,
    opportunity_id TEXT,
    proposal_id TEXT,
    execution_id TEXT,
    entity_id TEXT,
    category TEXT,
    keyword TEXT,
    outcome_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    reason TEXT,
    attributed_at TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    source_runtime TEXT NOT NULL,
    detector_version TEXT NOT NULL,
    lineage_quality TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CHECK (lineage_quality IN ('complete', 'partial', 'synthetic', 'missing'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_economic_memory (
    memory_id TEXT PRIMARY KEY,
    memory_scope TEXT NOT NULL,
    category TEXT NOT NULL,
    signal_keyword TEXT NOT NULL,
    entity_id TEXT,
    success_count INTEGER NOT NULL,
    failure_count INTEGER NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    minimum_sample_count INTEGER NOT NULL DEFAULT 3,
    total_revenue REAL NOT NULL,
    average_conversion REAL NOT NULL,
    time_decay_weight REAL NOT NULL DEFAULT 1,
    decay_half_life_days INTEGER NOT NULL DEFAULT 30,
    last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (memory_scope IN ('signal', 'category', 'entity'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_shadow_projections (
    projection_id TEXT PRIMARY KEY,
    market_signal_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    base_score REAL NOT NULL,
    adaptive_score REAL NOT NULL,
    score_delta REAL NOT NULL,
    adaptive_multiplier REAL NOT NULL,
    projection_type TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    CHECK (projection_type IN ('opportunity_ranking', 'proposal_confidence', 'entity_priority'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_shadow_comparisons (
    comparison_id TEXT PRIMARY KEY,
    market_signal_id TEXT NOT NULL,
    live_decision TEXT NOT NULL,
    shadow_decision TEXT NOT NULL,
    divergence_type TEXT NOT NULL,
    divergence_score REAL NOT NULL,
    estimated_economic_delta REAL NOT NULL,
    generated_at TEXT NOT NULL,
    CHECK (divergence_type IN ('score_delta_shift', 'ranking_shift', 'threshold_crossed', 'no_divergence'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_adaptive_equilibrium_evidence (
    evidence_id TEXT PRIMARY KEY,
    evidence_type TEXT NOT NULL,
    replay_consistency_equilibrium REAL NOT NULL,
    reinforcement_escalation_persistence REAL NOT NULL,
    saturation_equilibrium REAL NOT NULL,
    oscillation_damping REAL NOT NULL,
    projection_stability_convergence REAL NOT NULL,
    ranking_diversity_preservation REAL NOT NULL,
    entropy_evolution REAL NOT NULL,
    projection_lock_in_persistence REAL NOT NULL,
    low_confidence_amplification_persistence REAL NOT NULL,
    replay_degradation_persistence REAL NOT NULL,
    governance_classification TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    sustained_equilibrium_evidence INTEGER NOT NULL,
    replay_fingerprint TEXT NOT NULL,
    heatmap_snapshot_json TEXT NOT NULL DEFAULT '{}',
    evidence_contract_version TEXT NOT NULL DEFAULT 'legacy-unversioned',
    semantic_version_metadata_json TEXT NOT NULL DEFAULT '{}',
    reducer_semantic_metadata_json TEXT NOT NULL DEFAULT '{}',
    evidence_generation_metadata_json TEXT NOT NULL DEFAULT '{}',
    generated_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    CHECK (evidence_type IN ('adaptive_equilibrium_evidence')),
    CHECK (governance_classification IN ('SAFE', 'CAUTION', 'UNSAFE')),
    CHECK (recommendation IN ('do_not_rollout')),
    CHECK (sustained_equilibrium_evidence IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS flowmind_governance_evidence_timeline (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    event_timestamp TEXT NOT NULL,
    classification TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    severity TEXT NOT NULL,
    trigger_factors_json TEXT NOT NULL,
    replay_fingerprint TEXT NOT NULL,
    longitudinal_window TEXT NOT NULL,
    source_evidence_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    CHECK (event_type IN (
      'classification_transition',
      'recommendation_evolution',
      'replay_collapse',
      'instability_spike',
      'saturation_spike',
      'reinforcement_escalation',
      'equilibrium_degradation',
      'replay_degradation_evolution',
      'evidence_milestone'
    )),
    CHECK (classification IN ('SAFE', 'CAUTION', 'UNSAFE')),
    CHECK (recommendation IN ('do_not_rollout')),
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CHECK (longitudinal_window IN ('short', 'medium', 'long'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_institutional_continuity_state (
    state_id TEXT PRIMARY KEY,
    continuity_mode TEXT NOT NULL,
    persistence_truthfulness TEXT NOT NULL,
    recovery_required INTEGER NOT NULL DEFAULT 0,
    degraded_memory_fallback_active INTEGER NOT NULL DEFAULT 0,
    unsafe_shutdown_detected INTEGER NOT NULL DEFAULT 0,
    replay_continuity_state TEXT NOT NULL,
    restart_integrity_state TEXT NOT NULL,
    shutdown_integrity_state TEXT NOT NULL,
    blocked_capabilities_json TEXT NOT NULL DEFAULT '[]',
    last_reason TEXT,
    last_transition_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (continuity_mode IN ('institutional_safe', 'degraded_memory', 'continuity_untrusted', 'recovery_required')),
    CHECK (persistence_truthfulness IN ('guaranteed', 'degraded', 'untrusted')),
    CHECK (recovery_required IN (0, 1)),
    CHECK (degraded_memory_fallback_active IN (0, 1)),
    CHECK (unsafe_shutdown_detected IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS flowmind_runtime_continuity_attestation (
    attestation_id TEXT PRIMARY KEY,
    runtime_id TEXT NOT NULL,
    continuity_epoch TEXT NOT NULL,
    lineage_hash TEXT NOT NULL,
    replay_fingerprint TEXT,
    queue_fingerprint TEXT,
    checkpoint_fingerprint TEXT,
    shutdown_phase TEXT NOT NULL,
    attestation_status TEXT NOT NULL,
    verified_on_recovery INTEGER NOT NULL DEFAULT 0,
    reconstructed_on_recovery INTEGER NOT NULL DEFAULT 0,
    reconstruction_lineage_hash TEXT,
    reconstruction_source TEXT,
    generated_at TEXT NOT NULL,
    CHECK (shutdown_phase IN ('runtime_flush', 'queue_drain', 'checkpoint_flush', 'replay_flush', 'shutdown_complete')),
    CHECK (attestation_status IN ('pending', 'attested', 'failed')),
    CHECK (verified_on_recovery IN (0, 1)),
    CHECK (reconstructed_on_recovery IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS flowmind_sovereign_mutation_attestation (
    mutation_id TEXT PRIMARY KEY,
    mutation_type TEXT NOT NULL,
    mutation_scope TEXT NOT NULL,
    governance_decision TEXT NOT NULL,
    runtime_mode TEXT NOT NULL,
    continuity_mode TEXT NOT NULL,
    replay_verification_state TEXT NOT NULL,
    attestation_integrity TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    lineage_hash TEXT NOT NULL,
    executed INTEGER NOT NULL DEFAULT 0,
    persisted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    CHECK (governance_decision IN ('allowed', 'blocked', 'degraded_allowed')),
    CHECK (executed IN (0, 1)),
    CHECK (persisted IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS flowmind_sovereign_mutation_registry (
    mutation_id TEXT PRIMARY KEY,
    mutation_lineage_hash TEXT NOT NULL,
    replay_fingerprint TEXT,
    semantic_intent_id TEXT,
    continuity_epoch TEXT,
    effect_fingerprint TEXT,
    result_fingerprint TEXT,
    replay_result_shape TEXT,
    execution_class TEXT NOT NULL,
    first_execution_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    execution_count INTEGER NOT NULL DEFAULT 0,
    replay_count INTEGER NOT NULL DEFAULT 0,
    recovery_count INTEGER NOT NULL DEFAULT 0,
    deduplicated_count INTEGER NOT NULL DEFAULT 0,
    last_execution_state TEXT NOT NULL,
    lineage_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flowmind_sovereign_node (
    node_id TEXT PRIMARY KEY,
    node_class TEXT NOT NULL,
    institutional_plane_id TEXT NOT NULL,
    lineage_plane_id TEXT NOT NULL,
    replay_plane_id TEXT NOT NULL,
    authority_plane_id TEXT NOT NULL,
    persistence_plane_id TEXT NOT NULL,
    node_epoch TEXT NOT NULL,
    startup_attestation_hash TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (node_class IN ('primary', 'secondary', 'observer', 'replay', 'recovery'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_distributed_lineage (
    lineage_id TEXT PRIMARY KEY,
    originating_node_id TEXT NOT NULL,
    continuity_epoch TEXT NOT NULL,
    replay_fingerprint TEXT,
    mutation_lineage_hash TEXT,
    semantic_lineage_hash TEXT,
    attestation_lineage_hash TEXT,
    distributed_sequence INTEGER NOT NULL,
    distributed_clock_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flowmind_sovereign_quorum (
    quorum_id TEXT PRIMARY KEY,
    participating_nodes_json TEXT NOT NULL,
    active_nodes_json TEXT NOT NULL,
    quorum_health TEXT NOT NULL,
    quorum_continuity_state TEXT NOT NULL,
    consensus_mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (quorum_health IN ('healthy', 'degraded', 'split_brain_risk', 'unsafe')),
    CHECK (quorum_continuity_state IN ('verified', 'partial', 'unsafe')),
    CHECK (consensus_mode IN ('single_writer', 'advisory', 'shadow', 'disabled'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_distributed_attestation (
    attestation_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    attestation_plane TEXT NOT NULL,
    lineage_hash TEXT NOT NULL,
    continuity_epoch TEXT NOT NULL,
    distributed_clock_hash TEXT NOT NULL,
    attested_at TEXT NOT NULL,
    CHECK (attestation_plane IN ('replay', 'continuity', 'recovery', 'governance', 'semantic'))
  );

  CREATE TABLE IF NOT EXISTS flowmind_replay_federation_state (
    federation_event_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    source_node_id TEXT,
    event_type TEXT NOT NULL,
    continuity_epoch TEXT NOT NULL,
    replay_fingerprint TEXT,
    lineage_ids_json TEXT NOT NULL,
    plane_sync_metadata_json TEXT NOT NULL,
    continuity_verified INTEGER NOT NULL DEFAULT 0,
    distributed_clock_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (event_type IN ('export', 'import')),
    CHECK (continuity_verified IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS flowmind_distributed_recovery_epoch (
    recovery_epoch_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    recovery_epoch TEXT NOT NULL,
    continuity_epoch TEXT NOT NULL,
    recovery_state TEXT NOT NULL,
    federated_coordination_state TEXT NOT NULL,
    replay_restoration_marker TEXT,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (federated_coordination_state IN ('metadata_only', 'coordinating', 'observed'))
  );

  CREATE TRIGGER IF NOT EXISTS flowmind_distributed_lineage_no_update
  BEFORE UPDATE ON flowmind_distributed_lineage
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_distributed_lineage is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS flowmind_distributed_lineage_no_delete
  BEFORE DELETE ON flowmind_distributed_lineage
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_distributed_lineage is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS flowmind_distributed_attestation_no_update
  BEFORE UPDATE ON flowmind_distributed_attestation
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_distributed_attestation is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS flowmind_distributed_attestation_no_delete
  BEFORE DELETE ON flowmind_distributed_attestation
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_distributed_attestation is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS flowmind_replay_federation_state_no_update
  BEFORE UPDATE ON flowmind_replay_federation_state
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_replay_federation_state is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS flowmind_replay_federation_state_no_delete
  BEFORE DELETE ON flowmind_replay_federation_state
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_replay_federation_state is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS flowmind_distributed_recovery_epoch_no_update
  BEFORE UPDATE ON flowmind_distributed_recovery_epoch
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_distributed_recovery_epoch is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS flowmind_distributed_recovery_epoch_no_delete
  BEFORE DELETE ON flowmind_distributed_recovery_epoch
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_distributed_recovery_epoch is append-only');
  END;

  CREATE TABLE IF NOT EXISTS flowmind_auth_sovereign_attestation (
    mutation_id TEXT PRIMARY KEY,
    auth_scope TEXT NOT NULL,
    governance_decision TEXT NOT NULL,
    continuity_mode TEXT NOT NULL,
    runtime_mode TEXT NOT NULL,
    replay_verification_state TEXT NOT NULL,
    attestation_integrity TEXT NOT NULL,
    actor TEXT NOT NULL,
    target_user_id TEXT NULL,
    target_tenant_id TEXT NULL,
    target_session_id TEXT NULL,
    lineage_hash TEXT NOT NULL,
    persisted INTEGER NOT NULL DEFAULT 0,
    executed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flowmind_semantic_mutation_attestation (
    intent_id TEXT PRIMARY KEY,
    effect_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    intent_type TEXT NOT NULL,
    semantic_purpose TEXT NOT NULL,
    institutional_meaning TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    replay_relevant INTEGER NOT NULL DEFAULT 0,
    continuity_relevant INTEGER NOT NULL DEFAULT 0,
    auth_relevant INTEGER NOT NULL DEFAULT 0,
    before_fingerprint TEXT NULL,
    after_fingerprint TEXT NULL,
    replay_fingerprint TEXT NOT NULL,
    continuity_lineage_hash TEXT NOT NULL,
    mutation_lineage_hash TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flowmind_semantic_replay_result (
    replay_fingerprint TEXT,
    semantic_intent_id TEXT NOT NULL,
    mutation_lineage_hash TEXT NOT NULL,
    result_shape_hash TEXT NOT NULL,
    payload_snapshot TEXT NOT NULL,
    semantic_integrity TEXT NOT NULL,
    replay_result_state TEXT NOT NULL,
    lineage_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (semantic_integrity IN ('verified', 'partial', 'invalid')),
    CHECK (replay_result_state IN ('original', 'hydrated', 'reconstructed', 'fallback-safe', 'invalid'))
  );

  CREATE TRIGGER IF NOT EXISTS flowmind_semantic_replay_result_no_update
  BEFORE UPDATE ON flowmind_semantic_replay_result
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_semantic_replay_result is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS flowmind_semantic_replay_result_no_delete
  BEFORE DELETE ON flowmind_semantic_replay_result
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_semantic_replay_result is append-only');
  END;

  CREATE TABLE IF NOT EXISTS flowmind_sovereign_persistence_queue (
    queue_event_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    persistence_domain TEXT NOT NULL,
    execution_priority TEXT NOT NULL,
    execution_class TEXT NOT NULL,
    queue_state TEXT NOT NULL,
    queue_lineage_hash TEXT NOT NULL,
    lease_lineage_hash TEXT,
    mutation_lineage_hash TEXT,
    replay_fingerprint TEXT,
    continuity_epoch TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    actor_id TEXT,
    requested_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (persistence_domain IN ('governance', 'replay', 'semantic', 'auth', 'checkpoint', 'queue', 'runtime', 'entity')),
    CHECK (execution_priority IN ('critical', 'high', 'normal', 'background')),
    CHECK (execution_class IN ('runtime', 'replay', 'recovery', 'governance', 'auth')),
    CHECK (queue_state IN ('queued', 'started', 'completed', 'failed', 'retry', 'lease_acquired', 'lease_conflict', 'deduplicated'))
  );

  CREATE TRIGGER IF NOT EXISTS flowmind_sovereign_persistence_queue_no_update
  BEFORE UPDATE ON flowmind_sovereign_persistence_queue
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_sovereign_persistence_queue is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS flowmind_sovereign_persistence_queue_no_delete
  BEFORE DELETE ON flowmind_sovereign_persistence_queue
  BEGIN
    SELECT RAISE(ABORT, 'flowmind_sovereign_persistence_queue is append-only');
  END;

  CREATE TABLE IF NOT EXISTS flowmind_recovery_attestation (
    recovery_id TEXT PRIMARY KEY,
    recovery_state TEXT NOT NULL,
    replay_restored INTEGER NOT NULL DEFAULT 0,
    lineage_reconciled INTEGER NOT NULL DEFAULT 0,
    continuity_restored INTEGER NOT NULL DEFAULT 0,
    semantic_integrity_verified INTEGER NOT NULL DEFAULT 0,
    reconstructed_attestations INTEGER NOT NULL DEFAULT 0,
    replay_drift_detected INTEGER NOT NULL DEFAULT 0,
    recovery_lineage_hash TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    replay_restoration_state TEXT NOT NULL,
    lineage_reconciliation_state TEXT NOT NULL,
    continuity_restoration_state TEXT NOT NULL,
    semantic_integrity_state TEXT NOT NULL,
    attestation_reconstruction_state TEXT NOT NULL,
    recovery_lockdown_state TEXT NOT NULL,
    institutional_unlock_allowed INTEGER NOT NULL DEFAULT 0,
    recovery_metadata_json TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
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

  CREATE TABLE IF NOT EXISTS flow_auth_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_source TEXT,
    legacy_id INTEGER,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (email),
    UNIQUE (legacy_source, legacy_id)
  );

  CREATE TABLE IF NOT EXISTS flow_auth_tenant (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_source TEXT,
    legacy_id INTEGER,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    business_model TEXT NOT NULL,
    plan TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (slug),
    UNIQUE (legacy_source, legacy_id)
  );

  CREATE TABLE IF NOT EXISTS flow_auth_membership (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_source TEXT,
    legacy_id INTEGER,
    user_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (legacy_source, legacy_id),
    UNIQUE (user_id, tenant_id),
    FOREIGN KEY (user_id) REFERENCES flow_auth_user(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES flow_auth_tenant(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS flow_auth_password_reset_token (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_source TEXT,
    legacy_id INTEGER,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (token),
    UNIQUE (legacy_source, legacy_id),
    FOREIGN KEY (user_id) REFERENCES flow_auth_user(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS flow_auth_audit_event (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    user_id INTEGER,
    tenant_id INTEGER,
    actor_user_id INTEGER,
    actor_tenant_id INTEGER,
    outcome TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES flow_auth_user(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES flow_auth_tenant(id) ON DELETE SET NULL,
    FOREIGN KEY (actor_user_id) REFERENCES flow_auth_user(id) ON DELETE SET NULL,
    FOREIGN KEY (actor_tenant_id) REFERENCES flow_auth_tenant(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS flowmind_schema_migrations (
    migration_key TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}'
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
  'CREATE INDEX IF NOT EXISTS idx_entity_orchestrator_approval_queue_entity_id ON entity_orchestrator_approval_queue(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_orchestrator_approval_queue_proposal_id ON entity_orchestrator_approval_queue(proposal_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_orchestrator_approval_queue_status ON entity_orchestrator_approval_queue(status)',
  'CREATE INDEX IF NOT EXISTS idx_entity_orchestrator_approval_queue_hashes ON entity_orchestrator_approval_queue(proposal_hash, payload_hash)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_signal_entity_id ON entity_portfolio_lead_signal(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_signal_market_detected_at ON entity_portfolio_lead_signal(market, detected_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_signal_detected_at ON entity_portfolio_lead_signal(detected_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_entity_id ON entity_portfolio_lead(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_entity_status ON entity_portfolio_lead(entity_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_signal_id ON entity_portfolio_lead(signal_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_status ON entity_portfolio_lead(status)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_timestamp ON entity_portfolio_lead(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_converted_at ON entity_portfolio_lead(converted_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_intake_lead_id ON entity_portfolio_lead_intake(lead_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_intake_entity_id ON entity_portfolio_lead_intake(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_revenue_event_lead_id ON entity_portfolio_lead_revenue_event(lead_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_revenue_event_entity_id ON entity_portfolio_lead_revenue_event(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_lead_revenue_event_reconciled_at ON entity_portfolio_lead_revenue_event(reconciled_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_proposal_entity_id ON entity_portfolio_proposal(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_proposal_status ON entity_portfolio_proposal(status)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_proposal_created_at ON entity_portfolio_proposal(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_entity_portfolio_proposal_outcome_evaluated_at ON entity_portfolio_proposal_outcome(evaluated_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_decision_journal_entity_created_at ON flowmind_decision_journal(entity_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_execution_ledger_entity_status ON flowmind_execution_ledger(entity_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_opportunities_market_signal_id ON flowmind_opportunities(market_signal_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_opportunities_category ON flowmind_opportunities(category)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_opportunities_detected_at ON flowmind_opportunities(detected_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_opportunity_proposals_source_opportunity_id ON flowmind_opportunity_proposals(source_opportunity_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_opportunity_proposals_entity_id ON flowmind_opportunity_proposals(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_opportunity_proposals_governance_status ON flowmind_opportunity_proposals(governance_status)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_opportunity_proposals_created_at ON flowmind_opportunity_proposals(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_revenue_attribution_market_signal_id ON flowmind_revenue_attribution(market_signal_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_revenue_attribution_opportunity_id ON flowmind_revenue_attribution(opportunity_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_revenue_attribution_lead_id ON flowmind_revenue_attribution(lead_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_revenue_attribution_revenue_event_id ON flowmind_revenue_attribution(revenue_event_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_revenue_attribution_created_at ON flowmind_revenue_attribution(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_learning_ledger_attribution_id ON flowmind_learning_ledger(attribution_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_learning_ledger_category ON flowmind_learning_ledger(category)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_learning_ledger_signal_keyword ON flowmind_learning_ledger(signal_keyword)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_learning_ledger_observed_at ON flowmind_learning_ledger(observed_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_flowmind_learning_checkpoint_runtime_name ON flowmind_learning_checkpoint(runtime_name)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_runtime_continuity_attestation_runtime_epoch ON flowmind_runtime_continuity_attestation(runtime_id, continuity_epoch)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_runtime_continuity_attestation_generated_at ON flowmind_runtime_continuity_attestation(generated_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_runtime_continuity_attestation_phase_status ON flowmind_runtime_continuity_attestation(shutdown_phase, attestation_status)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_runtime_continuity_attestation_reconstructed ON flowmind_runtime_continuity_attestation(reconstructed_on_recovery, continuity_epoch)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_mutation_attestation_created_at ON flowmind_sovereign_mutation_attestation(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_mutation_attestation_scope ON flowmind_sovereign_mutation_attestation(mutation_scope, governance_decision)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_flowmind_sovereign_mutation_registry_lineage_hash ON flowmind_sovereign_mutation_registry(mutation_lineage_hash)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_mutation_registry_last_seen_at ON flowmind_sovereign_mutation_registry(last_seen_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_mutation_registry_execution_class ON flowmind_sovereign_mutation_registry(execution_class, last_execution_state)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_node_registered_at ON flowmind_sovereign_node(registered_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_node_authority_plane ON flowmind_sovereign_node(authority_plane_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_node_persistence_plane ON flowmind_sovereign_node(persistence_plane_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_flowmind_distributed_lineage_sequence ON flowmind_distributed_lineage(distributed_sequence)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_distributed_lineage_continuity_epoch ON flowmind_distributed_lineage(continuity_epoch, distributed_sequence)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_distributed_lineage_replay_fingerprint ON flowmind_distributed_lineage(replay_fingerprint)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_distributed_lineage_mutation_hash ON flowmind_distributed_lineage(mutation_lineage_hash)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_distributed_attestation_continuity_plane ON flowmind_distributed_attestation(continuity_epoch, attestation_plane)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_distributed_attestation_lineage_hash ON flowmind_distributed_attestation(lineage_hash)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_replay_federation_state_event_type ON flowmind_replay_federation_state(event_type, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_replay_federation_state_continuity_epoch ON flowmind_replay_federation_state(continuity_epoch)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_distributed_recovery_epoch_recovery_epoch ON flowmind_distributed_recovery_epoch(recovery_epoch)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_distributed_recovery_epoch_continuity_epoch ON flowmind_distributed_recovery_epoch(continuity_epoch)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_auth_sovereign_attestation_scope ON flowmind_auth_sovereign_attestation(auth_scope, governance_decision)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_auth_sovereign_attestation_created_at ON flowmind_auth_sovereign_attestation(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_semantic_mutation_attestation_domain ON flowmind_semantic_mutation_attestation(domain, verified)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_semantic_mutation_attestation_created_at ON flowmind_semantic_mutation_attestation(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_semantic_replay_result_intent_created_at ON flowmind_semantic_replay_result(semantic_intent_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_semantic_replay_result_replay_fingerprint ON flowmind_semantic_replay_result(replay_fingerprint)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_semantic_replay_result_shape_hash ON flowmind_semantic_replay_result(result_shape_hash)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_persistence_queue_operation_id ON flowmind_sovereign_persistence_queue(operation_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_persistence_queue_domain_state_created_at ON flowmind_sovereign_persistence_queue(persistence_domain, queue_state, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_persistence_queue_replay_fingerprint ON flowmind_sovereign_persistence_queue(replay_fingerprint)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_persistence_queue_lineage ON flowmind_sovereign_persistence_queue(queue_lineage_hash, lease_lineage_hash)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_sovereign_persistence_queue_priority_created_at ON flowmind_sovereign_persistence_queue(execution_priority, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_recovery_attestation_started_at ON flowmind_recovery_attestation(started_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_recovery_attestation_state ON flowmind_recovery_attestation(recovery_state, verified)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_outcomes_outcome_type ON flowmind_negative_outcomes(outcome_type)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_outcomes_entity_id ON flowmind_negative_outcomes(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_outcomes_category ON flowmind_negative_outcomes(category)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_outcomes_signal_keyword ON flowmind_negative_outcomes(signal_keyword)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_outcomes_detected_at ON flowmind_negative_outcomes(detected_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_outcome_id ON flowmind_negative_attribution(outcome_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_signal_id ON flowmind_negative_attribution(signal_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_opportunity_id ON flowmind_negative_attribution(opportunity_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_proposal_id ON flowmind_negative_attribution(proposal_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_execution_id ON flowmind_negative_attribution(execution_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_entity_id ON flowmind_negative_attribution(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_outcome_type ON flowmind_negative_attribution(outcome_type)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_occurred_at ON flowmind_negative_attribution(occurred_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_lineage_quality ON flowmind_negative_attribution(lineage_quality)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_negative_attribution_detected_at ON flowmind_negative_attribution(detected_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_economic_memory_scope ON flowmind_economic_memory(memory_scope)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_economic_memory_category ON flowmind_economic_memory(category)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_economic_memory_signal_keyword ON flowmind_economic_memory(signal_keyword)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_economic_memory_entity_id ON flowmind_economic_memory(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_economic_memory_total_revenue ON flowmind_economic_memory(total_revenue)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_shadow_projections_market_signal_id ON flowmind_shadow_projections(market_signal_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_shadow_projections_entity_id ON flowmind_shadow_projections(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_shadow_projections_generated_at ON flowmind_shadow_projections(generated_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_shadow_comparisons_market_signal_id ON flowmind_shadow_comparisons(market_signal_id)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_shadow_comparisons_generated_at ON flowmind_shadow_comparisons(generated_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_shadow_comparisons_divergence_type ON flowmind_shadow_comparisons(divergence_type)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_adaptive_equilibrium_evidence_generated_at ON flowmind_adaptive_equilibrium_evidence(generated_at)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_adaptive_equilibrium_evidence_classification ON flowmind_adaptive_equilibrium_evidence(governance_classification)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_adaptive_equilibrium_evidence_replay_fingerprint ON flowmind_adaptive_equilibrium_evidence(replay_fingerprint)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_governance_evidence_timeline_timestamp ON flowmind_governance_evidence_timeline(event_timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_governance_evidence_timeline_classification ON flowmind_governance_evidence_timeline(classification)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_governance_evidence_timeline_type ON flowmind_governance_evidence_timeline(event_type)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_governance_evidence_timeline_replay_fingerprint ON flowmind_governance_evidence_timeline(replay_fingerprint)',
  'CREATE INDEX IF NOT EXISTS idx_flowmind_governance_evidence_timeline_source_evidence_id ON flowmind_governance_evidence_timeline(source_evidence_id)',
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
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_user_email ON flow_auth_user(email)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_user_legacy_mapping ON flow_auth_user(legacy_source, legacy_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_tenant_slug ON flow_auth_tenant(slug)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_tenant_legacy_mapping ON flow_auth_tenant(legacy_source, legacy_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_membership_user_id ON flow_auth_membership(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_membership_tenant_id ON flow_auth_membership(tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_membership_user_tenant ON flow_auth_membership(user_id, tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_membership_legacy_mapping ON flow_auth_membership(legacy_source, legacy_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_password_reset_token_user_id ON flow_auth_password_reset_token(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_password_reset_token_expires_at ON flow_auth_password_reset_token(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_password_reset_token_legacy_mapping ON flow_auth_password_reset_token(legacy_source, legacy_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_audit_event_event_type ON flow_auth_audit_event(event_type)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_audit_event_user_id ON flow_auth_audit_event(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_audit_event_tenant_id ON flow_auth_audit_event(tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_flow_auth_audit_event_created_at ON flow_auth_audit_event(created_at)',
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

async function migrateSqlitePortfolioProposalSchema(db: BackendDatabase) {
  if (db.dialect !== 'sqlite') {
    return
  }

  const row = await db.get<{ sql?: string }>(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'entity_portfolio_proposal'
      LIMIT 1
    `,
  )

  if (!row?.sql || row.sql.includes("'acknowledged'")) {
    return
  }

  await db.transaction(async (tx) => {
    await tx.exec(`
      CREATE TABLE entity_portfolio_proposal_next (
        proposal_id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        market TEXT NOT NULL,
        proposal_type TEXT NOT NULL,
        status TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        priority_score REAL NOT NULL,
        rationale TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (status IN ('proposed', 'acknowledged', 'approved', 'rejected', 'expired', 'executed', 'evaluated')),
        CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))
      );
    `)
    await tx.exec(`
      INSERT INTO entity_portfolio_proposal_next (
        proposal_id,
        entity_id,
        market,
        proposal_type,
        status,
        risk_level,
        priority_score,
        rationale,
        payload_json,
        created_at,
        updated_at
      )
      SELECT
        proposal_id,
        entity_id,
        market,
        proposal_type,
        status,
        risk_level,
        priority_score,
        rationale,
        payload_json,
        created_at,
        updated_at
      FROM entity_portfolio_proposal
    `)
    await tx.exec('DROP TABLE entity_portfolio_proposal')
    await tx.exec('ALTER TABLE entity_portfolio_proposal_next RENAME TO entity_portfolio_proposal')
  })
}

async function migratePostgresPortfolioProposalSchema(db: BackendDatabase) {
  if (db.dialect !== 'postgres') {
    return
  }

  await db.exec(`
    DO $$
    DECLARE
      constraint_name TEXT;
    BEGIN
      SELECT con.conname
      INTO constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = current_schema()
        AND rel.relname = 'entity_portfolio_proposal'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%status IN (''proposed'')%';

      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE entity_portfolio_proposal DROP CONSTRAINT %I', constraint_name);
      END IF;
    END
    $$;
  `)

  await postgresAddConstraintIfMissing(
    db,
    'entity_portfolio_proposal',
    'entity_portfolio_proposal_status_check_v2',
    `CHECK (status IN ('proposed', 'acknowledged', 'approved', 'rejected', 'expired', 'executed', 'evaluated')) NOT VALID`,
  )
}

async function postgresTableExists(db: BackendDatabase, tableName: string) {
  const row = await db.get<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = ?
      ) AS exists
    `,
    tableName,
  )

  return Boolean(row?.exists)
}

async function postgresColumnExists(db: BackendDatabase, tableName: string, columnName: string) {
  const row = await db.get<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = ?
          AND column_name = ?
      ) AS exists
    `,
    tableName,
    columnName,
  )

  return Boolean(row?.exists)
}

async function postgresAddConstraintIfMissing(
  db: BackendDatabase,
  tableName: string,
  constraintName: string,
  definition: string,
) {
  const row = await db.get<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = current_schema()
          AND table_name = ?
          AND constraint_name = ?
      ) AS exists
    `,
    tableName,
    constraintName,
  )

  if (!row?.exists) {
    await db.exec(`ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} ${definition}`)
  }
}

async function postgresAddTriggerIfMissing(
  db: BackendDatabase,
  triggerName: string,
  tableName: string,
  statement: string,
) {
  const row = await db.get<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = ?
          AND tgrelid = to_regclass(current_schema() || '.' || ?)
          AND NOT tgisinternal
      ) AS exists
    `,
    triggerName,
    tableName,
  )

  if (!row?.exists) {
    await db.exec(statement)
  }
}

async function initializePostgresLegalCaseSchema(db: BackendDatabase) {
  if (db.dialect !== 'postgres') {
    return
  }

  await db.exec('CREATE EXTENSION IF NOT EXISTS pgcrypto')

  await db.exec(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;
  `)

  await db.exec(`
    CREATE OR REPLACE FUNCTION assign_case_message_sequence_no()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.sequence_no IS NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text || ':' || NEW.case_id::text));

        SELECT COALESCE(MAX(sequence_no), 0) + 1
          INTO NEW.sequence_no
        FROM case_messages
        WHERE tenant_id = NEW.tenant_id
          AND case_id = NEW.case_id;
      END IF;

      RETURN NEW;
    END;
    $$;
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS professionals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER NOT NULL,
      user_id INTEGER,
      external_ref TEXT,
      kind TEXT NOT NULL DEFAULT 'human',
      status TEXT NOT NULL DEFAULT 'active',
      display_name TEXT NOT NULL,
      primary_email TEXT,
      primary_phone TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (id, tenant_id),
      CHECK (kind IN ('human', 'ai', 'system')),
      CHECK (status IN ('active', 'inactive', 'suspended'))
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS professional_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER NOT NULL,
      professional_id UUID NOT NULL,
      headline TEXT,
      bio TEXT,
      specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
      credentials JSONB NOT NULL DEFAULT '[]'::jsonb,
      languages JSONB NOT NULL DEFAULT '[]'::jsonb,
      availability JSONB NOT NULL DEFAULT '{}'::jsonb,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (professional_id),
      FOREIGN KEY (professional_id, tenant_id)
        REFERENCES professionals(id, tenant_id)
        ON DELETE CASCADE
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER NOT NULL,
      case_number TEXT,
      entity_id TEXT,
      created_by_user_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      practice_area TEXT,
      source TEXT,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ,
      resolution_reason TEXT,
      lead_professional_id UUID,
      centelha_context JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (id, tenant_id),
      CHECK (status IN ('open', 'pending', 'dispatched', 'accepted', 'in_progress', 'on_hold', 'resolved', 'closed', 'archived')),
      CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      CHECK (closed_at IS NULL OR closed_at >= opened_at)
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER NOT NULL,
      case_id UUID NOT NULL,
      professional_id UUID NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      status TEXT NOT NULL DEFAULT 'active',
      assigned_by_professional_id UUID,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      unassigned_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (case_id, tenant_id)
        REFERENCES cases(id, tenant_id)
        ON DELETE CASCADE,
      FOREIGN KEY (professional_id, tenant_id)
        REFERENCES professionals(id, tenant_id)
        ON DELETE CASCADE,
      FOREIGN KEY (assigned_by_professional_id, tenant_id)
        REFERENCES professionals(id, tenant_id)
        ON DELETE SET NULL,
      CHECK (role IN ('owner', 'responsible', 'reviewer', 'observer', 'assistant')),
      CHECK (status IN ('active', 'accepted', 'rejected', 'completed', 'revoked', 'expired')),
      CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_dispatches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER NOT NULL,
      case_id UUID NOT NULL,
      professional_id UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      rejected_at TIMESTAMPTZ,
      expired_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      FOREIGN KEY (case_id, tenant_id)
        REFERENCES cases(id, tenant_id)
        ON DELETE CASCADE,
      FOREIGN KEY (professional_id, tenant_id)
        REFERENCES professionals(id, tenant_id)
        ON DELETE CASCADE,
      CHECK (status IN ('pending', 'accepted', 'rejected', 'expired'))
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_accept_idempotency (
      tenant_id INTEGER NOT NULL,
      case_id UUID NOT NULL,
      professional_id UUID NOT NULL,
      idempotency_key TEXT NOT NULL,
      response_status_code INTEGER,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, case_id, professional_id, idempotency_key),
      FOREIGN KEY (case_id, tenant_id)
        REFERENCES cases(id, tenant_id)
        ON DELETE CASCADE,
      FOREIGN KEY (professional_id, tenant_id)
        REFERENCES professionals(id, tenant_id)
        ON DELETE CASCADE
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER NOT NULL,
      case_id UUID NOT NULL,
      author_professional_id UUID,
      message_type TEXT NOT NULL DEFAULT 'note',
      message_status TEXT NOT NULL DEFAULT 'sent',
      direction TEXT NOT NULL DEFAULT 'internal',
      channel TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      content JSONB NOT NULL DEFAULT '{}'::jsonb,
      attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
      sequence_no INTEGER,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (case_id, tenant_id)
        REFERENCES cases(id, tenant_id)
        ON DELETE CASCADE,
      FOREIGN KEY (author_professional_id, tenant_id)
        REFERENCES professionals(id, tenant_id)
        ON DELETE SET NULL,
      CHECK (message_type IN ('note', 'email', 'sms', 'call', 'chat', 'system')),
      CHECK (direction IN ('inbound', 'outbound', 'internal'))
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_timeline (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER NOT NULL,
      case_id UUID NOT NULL,
      event_type TEXT NOT NULL,
      actor_professional_id UUID,
      actor_user_id INTEGER,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (case_id, tenant_id)
        REFERENCES cases(id, tenant_id)
        ON DELETE CASCADE,
      FOREIGN KEY (actor_professional_id, tenant_id)
        REFERENCES professionals(id, tenant_id)
        ON DELETE SET NULL
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS reputation (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER NOT NULL,
      professional_id UUID NOT NULL,
      score NUMERIC(10,2) NOT NULL DEFAULT 0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      response_time_avg_seconds INTEGER,
      last_event_at TIMESTAMPTZ,
      metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, professional_id),
      FOREIGN KEY (professional_id, tenant_id)
        REFERENCES professionals(id, tenant_id)
        ON DELETE CASCADE,
      CHECK (score >= 0),
      CHECK (rating_count >= 0),
      CHECK (success_count >= 0),
      CHECK (response_time_avg_seconds IS NULL OR response_time_avg_seconds >= 0)
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS learning_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id INTEGER NOT NULL,
      professional_id UUID,
      case_id UUID,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      impact_score NUMERIC(12,4),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (professional_id, tenant_id)
        REFERENCES professionals(id, tenant_id)
        ON DELETE SET NULL,
      FOREIGN KEY (case_id, tenant_id)
        REFERENCES cases(id, tenant_id)
        ON DELETE SET NULL
    )
  `)

  await db.exec(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS entity_id TEXT`)
  await db.exec(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER`)
  await db.exec(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`)
  await db.exec(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS resolution_reason TEXT`)
  await db.exec(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_number TEXT`)

  await db.exec(`
    DO $$
    DECLARE
      constraint_name TEXT;
    BEGIN
      SELECT con.conname
      INTO constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = current_schema()
        AND rel.relname = 'cases'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%status IN (''open'', ''pending'', ''on_hold'', ''resolved'', ''closed'', ''archived'')%';

      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE cases DROP CONSTRAINT %I', constraint_name);
      END IF;
    END
    $$;
  `)

  await postgresAddConstraintIfMissing(
    db,
    'cases',
    'cases_status_check_v2',
    `CHECK (status IN ('open', 'pending', 'dispatched', 'accepted', 'in_progress', 'on_hold', 'resolved', 'closed', 'archived')) NOT VALID`,
  )

  await db.exec(`ALTER TABLE case_messages ADD COLUMN IF NOT EXISTS sequence_no INTEGER`)
  await db.exec(`ALTER TABLE case_messages ADD COLUMN IF NOT EXISTS message_status TEXT DEFAULT 'sent'`)
  await db.exec(`ALTER TABLE flowmind_adaptive_equilibrium_evidence ADD COLUMN IF NOT EXISTS heatmap_snapshot_json TEXT NOT NULL DEFAULT '{}'`)
  await db.exec(`UPDATE case_messages SET message_status = 'sent' WHERE message_status IS NULL`)
  await db.exec(`ALTER TABLE case_messages ALTER COLUMN message_status SET DEFAULT 'sent'`)
  await db.exec(`ALTER TABLE case_messages ALTER COLUMN message_status SET NOT NULL`)

  await db.exec(`
    WITH ranked_messages AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY tenant_id, case_id
          ORDER BY created_at ASC, id ASC
        ) AS next_sequence_no
      FROM case_messages
      WHERE sequence_no IS NULL
    )
    UPDATE case_messages AS messages
    SET sequence_no = ranked_messages.next_sequence_no
    FROM ranked_messages
    WHERE messages.id = ranked_messages.id
  `)

  await postgresAddConstraintIfMissing(
    db,
    'case_messages',
    'case_messages_message_status_check',
    `CHECK (message_status IN ('draft', 'queued', 'sent', 'delivered', 'failed', 'read'))`,
  )

  await postgresAddConstraintIfMissing(
    db,
    'case_timeline',
    'case_timeline_event_type_check',
    `CHECK (event_type IN ('created', 'message_added', 'matched', 'assigned', 'accepted', 'rejected', 'closed', 'reopened', 'archived', 'feedback_received')) NOT VALID`,
  )

  await db.exec(`
    DO $$
    DECLARE
      constraint_name TEXT;
    BEGIN
      SELECT con.conname
      INTO constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = current_schema()
        AND rel.relname = 'case_assignments'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%status IN (''active'', ''completed'', ''revoked'')%';

      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE case_assignments DROP CONSTRAINT %I', constraint_name);
      END IF;
    END
    $$;
  `)

  await db.exec(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = current_schema()
          AND rel.relname = 'case_assignments'
          AND con.conname = 'case_assignments_status_check_v2'
          AND pg_get_constraintdef(con.oid) NOT LIKE '%expired%'
      ) THEN
        ALTER TABLE case_assignments DROP CONSTRAINT case_assignments_status_check_v2;
      END IF;
    END
    $$;
  `)

  await postgresAddConstraintIfMissing(
    db,
    'case_assignments',
    'case_assignments_status_check_v2',
    `CHECK (status IN ('active', 'accepted', 'rejected', 'completed', 'revoked', 'expired')) NOT VALID`,
  )

  await postgresAddConstraintIfMissing(
    db,
    'learning_events',
    'learning_events_event_type_check',
    `CHECK (event_type IN ('case_created', 'message_added', 'match_requested', 'matched', 'assigned', 'accepted', 'rejected', 'closed', 'feedback_received', 'manual_override')) NOT VALID`,
  )

  const caseMessagesHasNullSequenceNo = await db.get<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM case_messages WHERE sequence_no IS NULL) AS exists`,
  )

  if (!caseMessagesHasNullSequenceNo?.exists) {
    await db.exec(`ALTER TABLE case_messages ALTER COLUMN sequence_no SET NOT NULL`)
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_professionals_tenant_status
    ON professionals (tenant_id, status)
  `)
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_tenant_user
    ON professionals (tenant_id, user_id)
    WHERE user_id IS NOT NULL
  `)
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_tenant_external_ref
    ON professionals (tenant_id, external_ref)
    WHERE external_ref IS NOT NULL
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_professional_profiles_tenant_professional
    ON professional_profiles (tenant_id, professional_id)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cases_tenant_entity
    ON cases (tenant_id, entity_id)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cases_tenant_status_priority_created
    ON cases (tenant_id, status, priority, created_at DESC)
  `)
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_tenant_case_number_unique
    ON cases (tenant_id, case_number)
    WHERE case_number IS NOT NULL
  `)
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS cases_single_lead_idx
    ON cases (id)
    WHERE lead_professional_id IS NOT NULL
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_assignments_case_active
    ON case_assignments (tenant_id, case_id, status, assigned_at DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_assignments_professional_active
    ON case_assignments (tenant_id, professional_id, status, assigned_at DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_dispatches_case_status_created
    ON case_dispatches (tenant_id, case_id, status, created_at DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_dispatches_professional_status_created
    ON case_dispatches (tenant_id, professional_id, status, created_at DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_accept_idempotency_created
    ON case_accept_idempotency (tenant_id, professional_id, created_at DESC)
  `)
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_case_dispatches_pending
    ON case_dispatches (tenant_id, case_id, professional_id)
    WHERE status = 'pending'
  `)
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_case_assignments_active
    ON case_assignments (tenant_id, case_id, professional_id, role)
    WHERE unassigned_at IS NULL AND status = 'active'
  `)
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_case_messages_case_sequence
    ON case_messages (tenant_id, case_id, sequence_no)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_messages_case_created
    ON case_messages (tenant_id, case_id, created_at DESC, id DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_messages_author_professional
    ON case_messages (tenant_id, author_professional_id, created_at DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_timeline_case_occurred_at
    ON case_timeline (tenant_id, case_id, occurred_at DESC, id DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_timeline_event_type
    ON case_timeline (tenant_id, event_type, occurred_at DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reputation_tenant_score
    ON reputation (tenant_id, score DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_learning_events_case_occurred_at
    ON learning_events (tenant_id, case_id, occurred_at DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_learning_events_professional_occurred_at
    ON learning_events (tenant_id, professional_id, occurred_at DESC)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_learning_events_event_type_occurred_at
    ON learning_events (tenant_id, event_type, occurred_at DESC)
  `)

  await postgresAddTriggerIfMissing(
    db,
    'trg_professionals_updated_at',
    'professionals',
    `
      CREATE TRIGGER trg_professionals_updated_at
      BEFORE UPDATE ON professionals
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `,
  )
  await postgresAddTriggerIfMissing(
    db,
    'trg_professional_profiles_updated_at',
    'professional_profiles',
    `
      CREATE TRIGGER trg_professional_profiles_updated_at
      BEFORE UPDATE ON professional_profiles
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `,
  )
  await postgresAddTriggerIfMissing(
    db,
    'trg_cases_updated_at',
    'cases',
    `
      CREATE TRIGGER trg_cases_updated_at
      BEFORE UPDATE ON cases
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `,
  )
  await postgresAddTriggerIfMissing(
    db,
    'trg_case_assignments_updated_at',
    'case_assignments',
    `
      CREATE TRIGGER trg_case_assignments_updated_at
      BEFORE UPDATE ON case_assignments
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `,
  )
  await postgresAddTriggerIfMissing(
    db,
    'trg_case_dispatches_updated_at',
    'case_dispatches',
    `
      CREATE TRIGGER trg_case_dispatches_updated_at
      BEFORE UPDATE ON case_dispatches
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `,
  )
  await postgresAddTriggerIfMissing(
    db,
    'trg_case_messages_updated_at',
    'case_messages',
    `
      CREATE TRIGGER trg_case_messages_updated_at
      BEFORE UPDATE ON case_messages
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `,
  )
  await postgresAddTriggerIfMissing(
    db,
    'trg_case_messages_sequence_no',
    'case_messages',
    `
      CREATE TRIGGER trg_case_messages_sequence_no
      BEFORE INSERT ON case_messages
      FOR EACH ROW
      EXECUTE FUNCTION assign_case_message_sequence_no()
    `,
  )
  await postgresAddTriggerIfMissing(
    db,
    'trg_case_timeline_updated_at',
    'case_timeline',
    `
      CREATE TRIGGER trg_case_timeline_updated_at
      BEFORE UPDATE ON case_timeline
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `,
  )
  await postgresAddTriggerIfMissing(
    db,
    'trg_reputation_updated_at',
    'reputation',
    `
      CREATE TRIGGER trg_reputation_updated_at
      BEFORE UPDATE ON reputation
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `,
  )
  await postgresAddTriggerIfMissing(
    db,
    'trg_learning_events_updated_at',
    'learning_events',
    `
      CREATE TRIGGER trg_learning_events_updated_at
      BEFORE UPDATE ON learning_events
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at()
    `,
  )

  const hasTenantsTable = await postgresTableExists(db, 'tenants')
  if (hasTenantsTable) {
    await postgresAddConstraintIfMissing(
      db,
      'professionals',
      'professionals_tenant_id_fkey',
      'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    )
    await postgresAddConstraintIfMissing(
      db,
      'cases',
      'cases_tenant_id_fkey',
      'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    )
    await postgresAddConstraintIfMissing(
      db,
      'professional_profiles',
      'professional_profiles_tenant_id_fkey',
      'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    )
    await postgresAddConstraintIfMissing(
      db,
      'case_assignments',
      'case_assignments_tenant_id_fkey',
      'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    )
    await postgresAddConstraintIfMissing(
      db,
      'case_dispatches',
      'case_dispatches_tenant_id_fkey',
      'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    )
    await postgresAddConstraintIfMissing(
      db,
      'case_messages',
      'case_messages_tenant_id_fkey',
      'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    )
    await postgresAddConstraintIfMissing(
      db,
      'case_timeline',
      'case_timeline_tenant_id_fkey',
      'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    )
    await postgresAddConstraintIfMissing(
      db,
      'reputation',
      'reputation_tenant_id_fkey',
      'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    )
    await postgresAddConstraintIfMissing(
      db,
      'learning_events',
      'learning_events_tenant_id_fkey',
      'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
    )
  }

  const hasMembershipsTable = await postgresTableExists(db, 'memberships')
  if (hasMembershipsTable) {
    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_user_tenant_unique
      ON memberships (user_id, tenant_id)
    `)

    if (await postgresColumnExists(db, 'professionals', 'user_id')) {
      await postgresAddConstraintIfMissing(
        db,
        'professionals',
        'professionals_user_membership_fkey',
        'FOREIGN KEY (user_id, tenant_id) REFERENCES memberships(user_id, tenant_id) ON DELETE SET NULL',
      )
    }

    if (await postgresColumnExists(db, 'cases', 'created_by_user_id')) {
      await postgresAddConstraintIfMissing(
        db,
        'cases',
        'cases_created_by_user_membership_fkey',
        'FOREIGN KEY (created_by_user_id, tenant_id) REFERENCES memberships(user_id, tenant_id) ON DELETE SET NULL',
      )
    }
  }

  const hasUsersTable = await postgresTableExists(db, 'users')
  if (hasUsersTable && !hasMembershipsTable && await postgresColumnExists(db, 'cases', 'created_by_user_id')) {
    await postgresAddConstraintIfMissing(
      db,
      'cases',
      'cases_created_by_user_id_fkey',
      'FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL',
    )
  }

  const hasEntityProfileTable = await postgresTableExists(db, 'entity_profile')
  if (hasEntityProfileTable) {
    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_profile_id_owner_tenant
      ON entity_profile (id, owner_tenant_id)
    `)

    await postgresAddConstraintIfMissing(
      db,
      'cases',
      'cases_entity_profile_fkey',
      'FOREIGN KEY (entity_id, tenant_id) REFERENCES entity_profile(id, owner_tenant_id) ON DELETE RESTRICT',
    )
  }
}

async function initializeSqliteLegalCaseSchema(db: BackendDatabase) {
  if (db.dialect !== 'sqlite') {
    return
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      case_number TEXT,
      entity_id TEXT,
      created_by_user_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      practice_area TEXT,
      source TEXT,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      archived_at TEXT,
      resolution_reason TEXT,
      lead_professional_id TEXT,
      centelha_context TEXT NOT NULL DEFAULT '{}',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_messages (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      case_id TEXT NOT NULL,
      author_professional_id TEXT,
      message_type TEXT NOT NULL DEFAULT 'note',
      message_status TEXT NOT NULL DEFAULT 'sent',
      direction TEXT NOT NULL DEFAULT 'internal',
      channel TEXT,
      subject TEXT,
      body TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '{}',
      attachments TEXT NOT NULL DEFAULT '[]',
      sequence_no INTEGER,
      sent_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_timeline (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      case_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_professional_id TEXT,
      actor_user_id INTEGER,
      occurred_at TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_assignments (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      case_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'responsible',
      status TEXT NOT NULL DEFAULT 'active',
      assigned_by_professional_id TEXT,
      assigned_at TEXT NOT NULL,
      unassigned_at TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_dispatches (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      case_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      rejected_at TEXT,
      expired_at TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS case_accept_idempotency (
      tenant_id INTEGER NOT NULL,
      case_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      response_status_code INTEGER,
      response_body TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, case_id, professional_id, idempotency_key),
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS learning_events (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      professional_id TEXT,
      case_id TEXT,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      impact_score REAL,
      payload TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS professionals (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER,
      external_ref TEXT,
      kind TEXT NOT NULL DEFAULT 'human',
      status TEXT NOT NULL DEFAULT 'active',
      display_name TEXT NOT NULL,
      primary_email TEXT,
      primary_phone TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS professional_profiles (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      professional_id TEXT NOT NULL,
      headline TEXT,
      bio TEXT,
      specialties TEXT NOT NULL DEFAULT '[]',
      credentials TEXT NOT NULL DEFAULT '[]',
      languages TEXT NOT NULL DEFAULT '[]',
      availability TEXT NOT NULL DEFAULT '{}',
      settings TEXT NOT NULL DEFAULT '{}',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (professional_id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
    )
  `)

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cases_tenant_entity
    ON cases (tenant_id, entity_id)
  `)
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS cases_single_lead_idx
    ON cases (id)
    WHERE lead_professional_id IS NOT NULL
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_messages_case_sequence
    ON case_messages (tenant_id, case_id, sequence_no)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_timeline_case_occurred_at
    ON case_timeline (tenant_id, case_id, occurred_at)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_assignments_case_status
    ON case_assignments (tenant_id, case_id, status, assigned_at)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_dispatches_case_status_created
    ON case_dispatches (tenant_id, case_id, status, created_at)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_case_accept_idempotency_created
    ON case_accept_idempotency (tenant_id, professional_id, created_at)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_learning_events_case_occurred_at
    ON learning_events (tenant_id, case_id, occurred_at)
  `)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_professional_profiles_tenant_professional
    ON professional_profiles (tenant_id, professional_id)
  `)
}

export async function initializeDatabase(db: BackendDatabase) {
  await initializeBaseSchema(db)
  await initializeSqliteLegalCaseSchema(db)
  await migrateSqlitePortfolioProposalSchema(db)

  await ensureColumn(db, 'entity_event_log', 'caused_by_command_id', 'TEXT')
  await ensureColumn(db, 'entity_profile', 'owner_user_id', 'INTEGER')
  await ensureColumn(db, 'entity_profile', 'owner_tenant_id', 'INTEGER')
  await ensureColumn(db, 'entity_relational_trace', 'delta_continuity_confidence', 'REAL NOT NULL DEFAULT 0')
  await ensureColumn(db, 'orchestrator_snapshot', 'last_command_id', 'TEXT')
  await ensureColumn(db, 'orchestrator_snapshot', 'last_command_type', 'TEXT')
  await ensureColumn(db, 'orchestrator_snapshot', 'last_command_issued_at', 'TEXT')
  await ensureColumn(db, 'orchestrator_snapshot', 'last_command_source', 'TEXT')
  await ensureColumn(db, 'entity_orchestrator_approval_queue', 'proposal_hash', 'TEXT')
  await ensureColumn(db, 'entity_orchestrator_approval_queue', 'payload_hash', 'TEXT')
  await ensureColumn(db, 'entity_orchestrator_approval_queue', 'risk_level', 'TEXT')
  await ensureColumn(db, 'entity_portfolio_lead', 'status', "TEXT NOT NULL DEFAULT 'routed'")
  await ensureColumn(db, 'entity_portfolio_lead', 'qualified_at', 'TEXT')
  await ensureColumn(db, 'entity_portfolio_lead', 'contacted_at', 'TEXT')
  await ensureColumn(db, 'entity_portfolio_lead', 'converted_at', 'TEXT')
  await ensureColumn(db, 'entity_portfolio_lead', 'lost_at', 'TEXT')
  await ensureColumn(db, 'entity_portfolio_lead', 'revenue_amount', 'REAL')
  await ensureColumn(db, 'entity_portfolio_lead', 'lost_reason', 'TEXT')
  await ensureColumn(db, 'flowmind_economic_memory', 'memory_scope', "TEXT NOT NULL DEFAULT 'signal'")
  await ensureColumn(db, 'flowmind_economic_memory', 'entity_id', 'TEXT')
  await ensureColumn(db, 'flowmind_economic_memory', 'sample_count', 'INTEGER NOT NULL DEFAULT 0')
  await ensureColumn(db, 'flowmind_economic_memory', 'minimum_sample_count', 'INTEGER NOT NULL DEFAULT 3')
  await ensureColumn(db, 'flowmind_economic_memory', 'time_decay_weight', 'REAL NOT NULL DEFAULT 1')
  await ensureColumn(db, 'flowmind_economic_memory', 'decay_half_life_days', 'INTEGER NOT NULL DEFAULT 30')
  await ensureColumn(db, 'flowmind_negative_attribution', 'attributed_at', 'TEXT')
  await ensureColumn(db, 'flowmind_negative_attribution', 'metadata_json', 'TEXT')
  await ensureColumn(db, 'flowmind_negative_attribution', 'created_at', 'TEXT')
  await ensureColumn(db, 'flowmind_learning_checkpoint', 'checkpoint_version', 'INTEGER NOT NULL DEFAULT 1')
  await ensureColumn(db, 'flowmind_learning_checkpoint', 'lineage_key', 'TEXT')
  await ensureColumn(db, 'flowmind_learning_checkpoint', 'lineage_metadata_json', 'TEXT')
  await ensureColumn(db, 'flowmind_learning_checkpoint', 'checkpoint_payload_json', 'TEXT')
  await ensureColumn(db, 'flowmind_learning_checkpoint', 'continuity_fingerprint', 'TEXT')
  await ensureColumn(db, 'flowmind_learning_checkpoint', 'checkpoint_attestation_state', 'TEXT')
  await ensureColumn(db, 'flowmind_learning_checkpoint', 'attestation_lineage_hash', 'TEXT')
  await ensureColumn(db, 'flowmind_learning_checkpoint', 'replay_verification_metadata_json', 'TEXT')
  await ensureColumn(db, 'flowmind_runtime_continuity_attestation', 'reconstructed_on_recovery', 'INTEGER NOT NULL DEFAULT 0')
  await ensureColumn(db, 'flowmind_runtime_continuity_attestation', 'reconstruction_lineage_hash', 'TEXT')
  await ensureColumn(db, 'flowmind_runtime_continuity_attestation', 'reconstruction_source', 'TEXT')
  await ensureColumn(db, 'flowmind_sovereign_mutation_registry', 'result_fingerprint', 'TEXT')
  await ensureColumn(db, 'flowmind_sovereign_mutation_registry', 'replay_result_shape', 'TEXT')
  await ensureColumn(db, 'flow_auth_user', 'legacy_source', 'TEXT')
  await ensureColumn(db, 'flow_auth_user', 'legacy_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_user', 'name', 'TEXT NOT NULL DEFAULT \'\'')
  await ensureColumn(db, 'flow_auth_user', 'email', 'TEXT NOT NULL DEFAULT \'\'')
  await ensureColumn(db, 'flow_auth_user', 'password_hash', 'TEXT NOT NULL DEFAULT \'\'')
  await ensureColumn(db, 'flow_auth_user', 'is_active', 'INTEGER NOT NULL DEFAULT 1')
  await ensureColumn(db, 'flow_auth_user', 'created_at', 'TEXT')
  await ensureColumn(db, 'flow_auth_user', 'updated_at', 'TEXT')
  await ensureColumn(db, 'flow_auth_tenant', 'legacy_source', 'TEXT')
  await ensureColumn(db, 'flow_auth_tenant', 'legacy_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_tenant', 'name', 'TEXT NOT NULL DEFAULT \'\'')
  await ensureColumn(db, 'flow_auth_tenant', 'slug', 'TEXT NOT NULL DEFAULT \'\'')
  await ensureColumn(db, 'flow_auth_tenant', 'business_model', 'TEXT NOT NULL DEFAULT \'hybrid\'')
  await ensureColumn(db, 'flow_auth_tenant', 'plan', 'TEXT NOT NULL DEFAULT \'starter\'')
  await ensureColumn(db, 'flow_auth_tenant', 'is_active', 'INTEGER NOT NULL DEFAULT 1')
  await ensureColumn(db, 'flow_auth_tenant', 'created_at', 'TEXT')
  await ensureColumn(db, 'flow_auth_tenant', 'updated_at', 'TEXT')
  await ensureColumn(db, 'flow_auth_membership', 'legacy_source', 'TEXT')
  await ensureColumn(db, 'flow_auth_membership', 'legacy_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_membership', 'user_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_membership', 'tenant_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_membership', 'role', 'TEXT NOT NULL DEFAULT \'member\'')
  await ensureColumn(db, 'flow_auth_membership', 'is_active', 'INTEGER NOT NULL DEFAULT 1')
  await ensureColumn(db, 'flow_auth_membership', 'created_at', 'TEXT')
  await ensureColumn(db, 'flow_auth_membership', 'updated_at', 'TEXT')
  await ensureColumn(db, 'flow_auth_password_reset_token', 'legacy_source', 'TEXT')
  await ensureColumn(db, 'flow_auth_password_reset_token', 'legacy_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_password_reset_token', 'user_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_password_reset_token', 'token', 'TEXT NOT NULL DEFAULT \'\'')
  await ensureColumn(db, 'flow_auth_password_reset_token', 'expires_at', 'TEXT')
  await ensureColumn(db, 'flow_auth_password_reset_token', 'used_at', 'TEXT')
  await ensureColumn(db, 'flow_auth_password_reset_token', 'created_at', 'TEXT')
  await ensureColumn(db, 'flow_auth_audit_event', 'event_type', 'TEXT NOT NULL DEFAULT \'unknown\'')
  await ensureColumn(db, 'flow_auth_audit_event', 'user_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_audit_event', 'tenant_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_audit_event', 'actor_user_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_audit_event', 'actor_tenant_id', 'INTEGER')
  await ensureColumn(db, 'flow_auth_audit_event', 'outcome', 'TEXT NOT NULL DEFAULT \'unknown\'')
  await ensureColumn(db, 'flow_auth_audit_event', 'metadata_json', "TEXT NOT NULL DEFAULT '{}'")
  await ensureColumn(db, 'flow_auth_audit_event', 'created_at', 'TEXT')
  await migrateAdaptiveEquilibriumEvidenceSchema(db)
  await db.run("UPDATE entity_portfolio_lead SET status = 'routed' WHERE status IS NULL OR TRIM(status) = ''")
  await initializePostgresLegalCaseSchema(db)
  await migratePostgresPortfolioProposalSchema(db)
  await ensureIndexes(db, indexStatements)
  await validateAdaptiveEquilibriumEvidenceSchema(db)
}

export type { BackendDatabase, DatabaseConfig } from './dbClient.js'
