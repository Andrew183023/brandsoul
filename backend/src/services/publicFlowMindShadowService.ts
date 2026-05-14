import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { OrchestratorSnapshotRecord } from '../domain/orchestratorSnapshot.js'
import type { FlowMindPort } from './flowMindPort.js'
import { restoreOrchestratorState, type OrchestratorCommand } from '../orchestrator/orchestratorState.js'
import type { FlowMindDecision } from '../flowmind/types/flowMindDecision.js'
import { requireCanonicalEntityIdentity } from '../entities/identity/entityIdentityBuilder.js'

export const PUBLIC_FLOWMIND_SHADOW_NOTE_PREFIX = 'flowmind-public-shadow:'

export type PublicFlowMindShadowAuthorityView = {
  decisionSource: string
  terminalAuthority: string
  semanticFrozen: boolean
}

export type PublicFlowMindShadowFrontendDecision = {
  evaluatedAt: string
  intent: string
  action: string
  responseText: string
  authority: PublicFlowMindShadowAuthorityView
  latencyMs: number
}

export type PublicFlowMindShadowBackendDecision = {
  requestId: string
  evaluatedAt: string
  intent: string
  action: string
  confidence: number
  responseText: string
  authority: PublicFlowMindShadowAuthorityView
  lowRiskLaneUsed?: boolean
  fallbackUsed: boolean
  fallbackReason?: string
  latencyMs: number
}

export type PublicFlowMindShadowComparison = {
  divergenceScore: number
  responseTextSimilarity: number
  semanticInconsistencies: string[]
  intentChanged: boolean
  actionChanged: boolean
  authorityChanged: boolean
  responseTextChanged: boolean
}

export type PublicFlowMindShadowSnapshot = {
  version: 1
  requestId: string
  comparedAt: string
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision: PublicFlowMindShadowBackendDecision
  comparison: PublicFlowMindShadowComparison
  metrics: {
    fallbackRate: number
    sampleSize: number
    latencyMs: {
      frontend: number
      backend: number
      delta: number
    }
  }
}

export function clampPublicFlowMindMetric(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export function roundPublicFlowMindMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function buildTokenSet(value: string) {
  const normalized = normalizeText(value)
  return new Set(normalized.length === 0 ? [] : normalized.split(' '))
}

export function computePublicFlowMindResponseTextSimilarity(left: string, right: string) {
  const leftTokens = buildTokenSet(left)
  const rightTokens = buildTokenSet(right)

  if (leftTokens.size === 0 && rightTokens.size === 0) {
    return 1
  }

  const intersectionSize = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length
  const unionSize = new Set([...leftTokens, ...rightTokens]).size

  if (unionSize === 0) {
    return 1
  }

  return roundPublicFlowMindMetric(intersectionSize / unionSize)
}

function resolveFallbackStage(entityProfile: EntityProfile) {
  const playback = entityProfile.runtime?.control?.playback
  return typeof playback?.activeStage === 'string' ? playback.activeStage : undefined
}

function resolveEntityName(entityProfile: EntityProfile) {
  const canonicalIdentity = requireCanonicalEntityIdentity(entityProfile, 'publicFlowMindShadowService.resolveEntityName')
  return canonicalIdentity.identity.canonicalName
}

function buildPublicShadowCommand(args: {
  requestId: string
  userMessage: string
  now: string
}): OrchestratorCommand {
  return {
    type: 'command',
    name: 'register_interaction',
    commandId: `public-shadow:${args.requestId}`,
    issuedAt: args.now,
    source: 'user',
    payload: {
      interactionType: 'public-message-shadow',
      summary: args.userMessage,
      topics: args.userMessage
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4)
        .slice(0, 3),
      weight: 0.5,
    },
  }
}

export function renderPublicFlowMindShadowResponseText(entityName: string, decision: FlowMindDecision) {
  const mainFact = decision.responsePlan.requiredData?.[0]

  if (decision.action === 'refuse') {
    return `${entityName} mantem a presenca dentro de um limite seguro. ${decision.responsePlan.constraints?.[0] ?? ''}`.trim()
  }

  if (decision.action === 'sell') {
    return `${entityName} intensifica a presenca para conversao em torno de ${decision.responsePlan.topic}. ${decision.responsePlan.optionalCloseStyle === 'explore-promotion' ? 'Vou aproximar a conversa da proxima acao.' : ''}`.trim()
  }

  if (decision.action === 'support') {
    return `${entityName} responde com contencao e clareza sobre ${decision.responsePlan.topic}. ${mainFact ?? ''}`.trim()
  }

  if (decision.action === 'guide') {
    return `${entityName} reorganiza a presenca para orientar a proxima leitura. ${decision.responsePlan.topic}.`
  }

  return `${entityName} ajusta a presenca em torno de ${decision.responsePlan.topic}. ${mainFact ?? ''}`.trim()
}

export async function evaluatePublicFlowMindShadow(args: {
  entityProfile: EntityProfile
  latestSnapshot?: OrchestratorSnapshotRecord | null
  flowMindService?: FlowMindPort
  requestId: string
  userMessage: string
  now?: string
}): Promise<PublicFlowMindShadowBackendDecision | undefined> {
  const now = args.now ?? new Date().toISOString()

  if (!args.flowMindService || args.flowMindService.mode === 'disabled') {
    return undefined
  }

  const state = restoreOrchestratorState({
    entityId: args.entityProfile.id,
    entityProfile: args.entityProfile,
    snapshot: args.latestSnapshot,
    fallbackStage: resolveFallbackStage(args.entityProfile),
    now,
  })
  const command = buildPublicShadowCommand({
    requestId: args.requestId,
    userMessage: args.userMessage,
    now,
  })
  const startedAt = Date.now()
  const result = await args.flowMindService.evaluateOrchestratorCommand({
    entityProfile: args.entityProfile,
    state,
    command,
    now,
  })

  if (!result) {
    return undefined
  }

  return {
    requestId: args.requestId,
    evaluatedAt: result.summary.invokedAt,
    intent: result.summary.decision.intent,
    action: result.summary.decision.action,
    confidence: result.summary.decision.confidence,
    responseText: renderPublicFlowMindShadowResponseText(resolveEntityName(args.entityProfile), result.output.decision),
    authority: {
      decisionSource: result.summary.decisionSource,
      terminalAuthority: result.summary.terminalAuthority,
      semanticFrozen: result.summary.semanticFrozen,
    },
    lowRiskLaneUsed: result.summary.lowRiskLaneUsed === true,
    fallbackUsed: result.summary.fallbackUsed,
    fallbackReason: result.summary.fallbackReason,
    latencyMs: Math.max(0, Date.now() - startedAt),
  }
}

function isAuthorityCandidate(value: unknown): value is PublicFlowMindShadowAuthorityView {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.decisionSource === 'string'
    && typeof record.terminalAuthority === 'string'
    && typeof record.semanticFrozen === 'boolean'
}

export function isPublicFlowMindShadowFrontendDecisionCandidate(value: unknown): value is PublicFlowMindShadowFrontendDecision {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.evaluatedAt === 'string'
    && typeof record.intent === 'string'
    && typeof record.action === 'string'
    && typeof record.responseText === 'string'
    && typeof record.latencyMs === 'number'
    && Number.isFinite(record.latencyMs)
    && isAuthorityCandidate(record.authority)
}

export function isPublicFlowMindShadowBackendDecisionCandidate(value: unknown): value is PublicFlowMindShadowBackendDecision {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.requestId === 'string'
    && typeof record.evaluatedAt === 'string'
    && typeof record.intent === 'string'
    && typeof record.action === 'string'
    && typeof record.confidence === 'number'
    && Number.isFinite(record.confidence)
    && typeof record.responseText === 'string'
    && (record.lowRiskLaneUsed === undefined || typeof record.lowRiskLaneUsed === 'boolean')
    && typeof record.fallbackUsed === 'boolean'
    && (record.fallbackReason === undefined || typeof record.fallbackReason === 'string')
    && typeof record.latencyMs === 'number'
    && Number.isFinite(record.latencyMs)
    && isAuthorityCandidate(record.authority)
}

export function buildPublicFlowMindDecisionComparison(args: {
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision: PublicFlowMindShadowBackendDecision
}): PublicFlowMindShadowComparison {
  const intentChanged = normalizeText(args.frontendDecision.intent) !== normalizeText(args.backendDecision.intent)
  const actionChanged = normalizeText(args.frontendDecision.action) !== normalizeText(args.backendDecision.action)
  const responseTextSimilarity = computePublicFlowMindResponseTextSimilarity(
    args.frontendDecision.responseText,
    args.backendDecision.responseText,
  )
  const responseTextChanged = normalizeText(args.frontendDecision.responseText) !== normalizeText(args.backendDecision.responseText)
    && responseTextSimilarity < 0.94
  const authorityChanged = args.frontendDecision.authority.decisionSource !== args.backendDecision.authority.decisionSource
    || args.frontendDecision.authority.terminalAuthority !== args.backendDecision.authority.terminalAuthority
    || args.frontendDecision.authority.semanticFrozen !== args.backendDecision.authority.semanticFrozen
  const semanticInconsistencies: string[] = []

  if (intentChanged) {
    semanticInconsistencies.push('intent-mismatch')
  }

  if (actionChanged) {
    semanticInconsistencies.push('action-mismatch')
  }

  if (args.frontendDecision.authority.decisionSource !== args.backendDecision.authority.decisionSource) {
    semanticInconsistencies.push('decision-source-mismatch')
  }

  if (args.frontendDecision.authority.terminalAuthority !== args.backendDecision.authority.terminalAuthority) {
    semanticInconsistencies.push('terminal-authority-mismatch')
  }

  if (args.frontendDecision.authority.semanticFrozen !== args.backendDecision.authority.semanticFrozen) {
    semanticInconsistencies.push('semantic-freeze-mismatch')
  }

  if (responseTextChanged) {
    semanticInconsistencies.push('response-text-drift')
  }

  const divergenceScore = roundPublicFlowMindMetric(clampPublicFlowMindMetric(
    (intentChanged ? 0.3 : 0)
      + (actionChanged ? 0.24 : 0)
      + (authorityChanged ? 0.2 : 0)
      + (responseTextChanged ? 0.14 + (1 - responseTextSimilarity) * 0.12 : 0)
      + (args.backendDecision.fallbackUsed ? 0.08 : 0),
  ))

  return {
    divergenceScore,
    responseTextSimilarity,
    semanticInconsistencies,
    intentChanged,
    actionChanged,
    authorityChanged,
    responseTextChanged,
  }
}

function isSnapshotCandidate(value: unknown): value is PublicFlowMindShadowSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return record.version === 1
    && typeof record.requestId === 'string'
    && typeof record.comparedAt === 'string'
    && isPublicFlowMindShadowFrontendDecisionCandidate(record.frontendDecision)
    && isPublicFlowMindShadowBackendDecisionCandidate(record.backendDecision)
    && !!record.comparison
    && !!record.metrics
}

export function parsePublicFlowMindShadowSnapshot(note: string): PublicFlowMindShadowSnapshot | undefined {
  if (!note.startsWith(PUBLIC_FLOWMIND_SHADOW_NOTE_PREFIX)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(note.slice(PUBLIC_FLOWMIND_SHADOW_NOTE_PREFIX.length)) as unknown
    if (!isSnapshotCandidate(parsed)) {
      return undefined
    }

    return parsed
  } catch {
    return undefined
  }
}

export function listPublicFlowMindShadowSnapshots(entityProfile?: Pick<EntityProfile, 'metadata'>) {
  return (entityProfile?.metadata.notes ?? [])
    .map((note) => parsePublicFlowMindShadowSnapshot(note))
    .filter((snapshot): snapshot is PublicFlowMindShadowSnapshot => snapshot !== undefined)
}

export function buildPublicFlowMindShadowSnapshot(args: {
  entityProfile?: EntityProfile
  requestId: string
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision: PublicFlowMindShadowBackendDecision
  comparedAt?: string
}): PublicFlowMindShadowSnapshot {
  const comparison = buildPublicFlowMindDecisionComparison({
    frontendDecision: args.frontendDecision,
    backendDecision: args.backendDecision,
  })
  const history = listPublicFlowMindShadowSnapshots(args.entityProfile)
  const sampleSize = history.length + 1
  const fallbackCount = history.filter((snapshot) => snapshot.backendDecision.fallbackUsed).length + (args.backendDecision.fallbackUsed ? 1 : 0)

  return {
    version: 1,
    requestId: args.requestId,
    comparedAt: args.comparedAt ?? new Date().toISOString(),
    frontendDecision: args.frontendDecision,
    backendDecision: args.backendDecision,
    comparison,
    metrics: {
      fallbackRate: roundPublicFlowMindMetric(fallbackCount / sampleSize),
      sampleSize,
      latencyMs: {
        frontend: Math.round(args.frontendDecision.latencyMs),
        backend: Math.round(args.backendDecision.latencyMs),
        delta: Math.round(args.backendDecision.latencyMs - args.frontendDecision.latencyMs),
      },
    },
  }
}

export function serializePublicFlowMindShadowSnapshot(snapshot: PublicFlowMindShadowSnapshot) {
  return `${PUBLIC_FLOWMIND_SHADOW_NOTE_PREFIX}${JSON.stringify(snapshot)}`
}

export function appendPublicFlowMindShadowSnapshot(entityProfile: EntityProfile, snapshot: PublicFlowMindShadowSnapshot): EntityProfile {
  const notes = entityProfile.metadata.notes ?? []

  return {
    ...entityProfile,
    metadata: {
      ...entityProfile.metadata,
      notes: [
        serializePublicFlowMindShadowSnapshot(snapshot),
        ...notes,
      ].slice(0, 32),
    },
  }
}
