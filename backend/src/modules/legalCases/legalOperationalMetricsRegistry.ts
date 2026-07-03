export type LegalOperationalMetricType =
  | 'counter'
  | 'gauge'
  | 'timing'

export type LegalOperationalMetricCategory =
  | 'public_triage'
  | 'anti_duplication'
  | 'anti_spam'
  | 'portal'
  | 'timeline'
  | 'assignment'
  | 'matching'
  | 'case_lifecycle'
  | 'message'
  | 'canonical_read'
  | 'canonical_identity'
  | 'transaction'

export type LegalOperationalMetricLabel =
  | 'tenant_id'
  | 'entity_id'
  | 'source'
  | 'reason'
  | 'status'
  | 'event'
  | 'result'
  | 'pipeline'
  | 'stage'
  | 'operation'
  | 'mode'
  | 'decision'

export type LegalOperationalMetricDefinition = {
  name: string
  type: LegalOperationalMetricType
  category: LegalOperationalMetricCategory
  description: string
  labels: LegalOperationalMetricLabel[]
  requiredForDashboard: boolean
  instrumented: boolean
  status: 'active' | 'planned' | 'legacy'
}

const LEGAL_OPERATIONAL_METRICS: LegalOperationalMetricDefinition[] = [
  {
    name: 'public_triage_requests_total',
    type: 'counter',
    category: 'public_triage',
    description: 'Total de requisições recebidas pela triagem pública jurídica.',
    labels: ['tenant_id', 'source', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_valid_total',
    type: 'counter',
    category: 'public_triage',
    description: 'Total de triagens públicas validadas antes da captura operacional.',
    labels: ['tenant_id', 'source', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_invalid_total',
    type: 'counter',
    category: 'public_triage',
    description: 'Total de triagens públicas rejeitadas por payload inválido.',
    labels: ['tenant_id', 'source', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_case_created_total',
    type: 'counter',
    category: 'public_triage',
    description: 'Total de casos criados a partir da triagem pública.',
    labels: ['tenant_id', 'entity_id', 'source', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_case_reused_total',
    type: 'counter',
    category: 'public_triage',
    description: 'Total de triagens públicas que reutilizaram um caso já existente.',
    labels: ['entity_id', 'source', 'reason'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_request_replays_total',
    type: 'counter',
    category: 'anti_duplication',
    description: 'Total de replays detectados por requestId no intake público.',
    labels: ['entity_id', 'source', 'reason'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_fingerprint_hits_total',
    type: 'counter',
    category: 'anti_duplication',
    description: 'Total de hits de fingerprint equivalentes na triagem pública.',
    labels: ['entity_id', 'source', 'reason'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_fingerprint_reservations_total',
    type: 'counter',
    category: 'anti_duplication',
    description: 'Total de reservations de fingerprint criadas para triagens públicas.',
    labels: ['entity_id', 'source', 'reason'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_duplicate_prevented_total',
    type: 'counter',
    category: 'anti_duplication',
    description: 'Total agregado de duplicidades evitadas na triagem pública.',
    labels: ['entity_id', 'source', 'reason'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_concurrency_pending_total',
    type: 'counter',
    category: 'anti_duplication',
    description: 'Total de triagens públicas que entraram em espera por concorrência ativa.',
    labels: ['entity_id', 'source', 'reason'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_creation_pending_total',
    type: 'counter',
    category: 'anti_duplication',
    description: 'Total de triagens públicas que expiraram em estado pending de criação.',
    labels: ['entity_id', 'source', 'reason'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_spam_allowed_total',
    type: 'counter',
    category: 'anti_spam',
    description: 'Total de tentativas de triagem pública permitidas pela política anti-spam.',
    labels: ['entity_id', 'source', 'reason', 'decision'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_spam_blocked_total',
    type: 'counter',
    category: 'anti_spam',
    description: 'Total de tentativas de triagem pública bloqueadas pela política anti-spam.',
    labels: ['entity_id', 'source', 'reason', 'decision'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_spam_cooldown_total',
    type: 'counter',
    category: 'anti_spam',
    description: 'Total de triagens públicas que entraram em cooldown anti-spam.',
    labels: ['entity_id', 'source', 'reason', 'decision'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_spam_rate_limited_total',
    type: 'counter',
    category: 'anti_spam',
    description: 'Total de respostas rate limited devolvidas pela camada anti-spam.',
    labels: ['entity_id', 'source', 'reason', 'decision'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'public_triage_spam_invalid_payload_total',
    type: 'counter',
    category: 'anti_spam',
    description: 'Total de payloads inválidos contabilizados pela camada anti-spam.',
    labels: ['entity_id', 'source', 'reason', 'decision'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_portal_access_created_total',
    type: 'counter',
    category: 'portal',
    description: 'Total de sessões de acesso ao portal do cliente emitidas.',
    labels: ['tenant_id', 'entity_id', 'source', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_portal_access_used_total',
    type: 'counter',
    category: 'portal',
    description: 'Total de primeiros usos válidos de acesso ao portal do cliente.',
    labels: ['tenant_id', 'entity_id', 'source', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_portal_access_invalid_total',
    type: 'counter',
    category: 'portal',
    description: 'Total de tentativas inválidas de acesso ao portal do cliente.',
    labels: ['tenant_id', 'entity_id', 'source', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_portal_access_expired_total',
    type: 'counter',
    category: 'portal',
    description: 'Total de acessos ao portal recusados por expiração do token.',
    labels: ['tenant_id', 'entity_id', 'source', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_timeline_events_total',
    type: 'counter',
    category: 'timeline',
    description: 'Total de eventos gravados na timeline canônica do caso.',
    labels: ['tenant_id', 'entity_id', 'event', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_timeline_write_failures_total',
    type: 'counter',
    category: 'timeline',
    description: 'Total de falhas ao persistir eventos da timeline canônica.',
    labels: ['tenant_id', 'entity_id', 'event', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_assignment_created_total',
    type: 'counter',
    category: 'assignment',
    description: 'Total de assignments jurídicos criados.',
    labels: ['tenant_id', 'entity_id', 'operation', 'result', 'source'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_assignment_accepted_total',
    type: 'counter',
    category: 'assignment',
    description: 'Total de assignments jurídicos aceitos.',
    labels: ['tenant_id', 'entity_id', 'operation', 'result', 'source'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_assignment_rejected_total',
    type: 'counter',
    category: 'assignment',
    description: 'Total de assignments jurídicos rejeitados.',
    labels: ['tenant_id', 'entity_id', 'operation', 'result', 'source'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_assignment_reassigned_total',
    type: 'counter',
    category: 'assignment',
    description: 'Total de reatribuições de responsável jurídico.',
    labels: ['tenant_id', 'entity_id', 'operation', 'result', 'source'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_assignment_expired_total',
    type: 'counter',
    category: 'assignment',
    description: 'Total de assignments expirados sem aceite.',
    labels: ['tenant_id', 'entity_id', 'operation', 'result', 'source'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_matching_started_total',
    type: 'counter',
    category: 'matching',
    description: 'Total de fluxos de matching jurídico iniciados.',
    labels: ['tenant_id', 'entity_id', 'pipeline', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_matching_completed_total',
    type: 'counter',
    category: 'matching',
    description: 'Total de fluxos de matching jurídico concluídos.',
    labels: ['tenant_id', 'entity_id', 'pipeline', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_matching_failed_total',
    type: 'counter',
    category: 'matching',
    description: 'Total de falhas no matching jurídico.',
    labels: ['tenant_id', 'entity_id', 'pipeline', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_matching_queue_depth',
    type: 'gauge',
    category: 'matching',
    description: 'Profundidade atual da fila operacional de matching jurídico.',
    labels: ['tenant_id', 'entity_id', 'pipeline', 'stage'],
    requiredForDashboard: true,
    instrumented: false,
    status: 'planned',
  },
  {
    name: 'legal_case_created_total',
    type: 'counter',
    category: 'case_lifecycle',
    description: 'Total de casos jurídicos criados operacionalmente.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_case_reused_total',
    type: 'counter',
    category: 'case_lifecycle',
    description: 'Total de casos jurídicos reutilizados por replay ou fingerprint.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_case_closed_total',
    type: 'counter',
    category: 'case_lifecycle',
    description: 'Total de casos jurídicos encerrados.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'status', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_case_status_changed_total',
    type: 'counter',
    category: 'case_lifecycle',
    description: 'Total de transições de status de casos jurídicos.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'status', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_message_sent_total',
    type: 'counter',
    category: 'message',
    description: 'Total de mensagens enviadas pelo escritório em casos jurídicos.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_message_received_total',
    type: 'counter',
    category: 'message',
    description: 'Total de mensagens recebidas do cliente em casos jurídicos.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_message_failed_total',
    type: 'counter',
    category: 'message',
    description: 'Total de falhas ao persistir mensagens jurídicas.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_canonical_read_total',
    type: 'counter',
    category: 'canonical_read',
    description: 'Total de leituras canônicas de caso executadas.',
    labels: ['tenant_id', 'entity_id', 'pipeline', 'stage', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_canonical_read_failed_total',
    type: 'counter',
    category: 'canonical_read',
    description: 'Total de falhas no pipeline de leitura canônica de caso.',
    labels: ['tenant_id', 'entity_id', 'pipeline', 'stage', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_canonical_read_duration_ms',
    type: 'timing',
    category: 'canonical_read',
    description: 'Duração agregada das leituras canônicas de caso.',
    labels: ['tenant_id', 'entity_id', 'pipeline', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_structured_identity_used_total',
    type: 'counter',
    category: 'canonical_identity',
    description: 'Total de leituras que utilizaram identidade estruturada como fonte operacional.',
    labels: ['tenant_id', 'entity_id', 'source', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_identity_fallback_used_total',
    type: 'counter',
    category: 'canonical_identity',
    description: 'Total de leituras que recorreram a fallback histórico de identidade.',
    labels: ['tenant_id', 'entity_id', 'source', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_transaction_rollbacks_total',
    type: 'counter',
    category: 'transaction',
    description: 'Total de rollbacks em transações jurídicas operacionais.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'stage', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
  {
    name: 'legal_transaction_failures_total',
    type: 'counter',
    category: 'transaction',
    description: 'Total de falhas transacionais em fluxos jurídicos operacionais.',
    labels: ['tenant_id', 'entity_id', 'source', 'operation', 'stage', 'reason', 'result'],
    requiredForDashboard: true,
    instrumented: true,
    status: 'active',
  },
]

const LEGAL_OPERATIONAL_METRICS_BY_NAME = new Map(
  LEGAL_OPERATIONAL_METRICS.map((metric) => [metric.name, metric] as const),
)

export function listLegalOperationalMetrics(): LegalOperationalMetricDefinition[] {
  return LEGAL_OPERATIONAL_METRICS.map((metric) => ({
    ...metric,
    labels: [...metric.labels],
  }))
}

export function getLegalOperationalMetric(name: string): LegalOperationalMetricDefinition | undefined {
  const metric = LEGAL_OPERATIONAL_METRICS_BY_NAME.get(name)
  if (!metric) {
    return undefined
  }

  return {
    ...metric,
    labels: [...metric.labels],
  }
}

export function assertLegalMetricIsRegistered(name: string): LegalOperationalMetricDefinition {
  const metric = getLegalOperationalMetric(name)
  if (!metric) {
    throw new Error(`Unknown legal operational metric: ${name}`)
  }

  return metric
}
