import type { EntityAction } from '../domain/entity/contracts/EntityAction.js'
import { normalizeCognitiveInput } from './cognitiveInput.js'

const DEFAULT_ALLOWED_TYPES = [
  'observeContext',
  'sendMessage',
  'suggestProduct',
  'suggestDiscovery',
  'askQuestion',
  'triggerExport',
  'triggerEvent',
  'updateMemory',
  'entityInteraction',
  'create_entity',
] as const

const DEFAULT_MAX_CONFIDENCE = 0.92
const DEFAULT_MIN_INTERVAL_MS = 12_000

export type FlowMindActionPolicyContext = 'creation' | 'interaction' | 'final' | 'export'

const ALLOWED_TYPES_BY_CONTEXT: Record<FlowMindActionPolicyContext, string[]> = {
  creation: ['observeContext', 'sendMessage', 'askQuestion', 'updateMemory', 'triggerEvent', 'create_entity'],
  interaction: ['observeContext', 'sendMessage', 'askQuestion', 'suggestDiscovery', 'updateMemory', 'triggerEvent'],
  final: ['observeContext', 'sendMessage', 'suggestProduct', 'suggestDiscovery', 'triggerExport', 'triggerEvent', 'entityInteraction'],
  export: ['observeContext', 'sendMessage', 'suggestProduct', 'suggestDiscovery', 'triggerExport', 'triggerEvent', 'entityInteraction'],
}

type ValidateActionOptions = {
  allowedTypes?: string[]
  policyContext?: FlowMindActionPolicyContext
  now?: string
  maxConfidence?: number
  minIntervalMs?: number
  previousActionAt?: string
  previousActionType?: string
}

type FlowMindSafeDecision = {
  intent: 'observe'
  action: 'none'
}

export type FlowMindGuardResult = {
  action: EntityAction
  allowed: boolean
  reason?: string
  failureKind?: 'validation' | 'policy' | 'conflict'
  failureCode?: string
  safeDecision?: FlowMindSafeDecision
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function getTimestampMs(value?: string) {
  if (!value) {
    return undefined
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function resolveAllowedTypes(options: ValidateActionOptions) {
  if (Array.isArray(options.allowedTypes) && options.allowedTypes.length > 0) {
    return [...options.allowedTypes]
  }

  if (options.policyContext) {
    return [...ALLOWED_TYPES_BY_CONTEXT[options.policyContext]]
  }

  return [...DEFAULT_ALLOWED_TYPES]
}

function hasUnsafeCombination(action: EntityAction, context: FlowMindActionPolicyContext | undefined) {
  const eventName = typeof action.payload?.eventName === 'string' ? action.payload.eventName : undefined

  if (action.type === 'triggerExport' && context !== 'final' && context !== 'export') {
    return 'Trigger export requires final or export context.'
  }

  if (action.type === 'entityInteraction' && context !== 'final' && context !== 'export') {
    return 'Entity interaction is only allowed in final or export context.'
  }

  if (action.type === 'triggerEvent' && eventName === 'prepare_share' && context !== 'final' && context !== 'export') {
    return 'prepare_share is only allowed in final or export context.'
  }

  if (action.type === 'triggerEvent' && eventName === 'surface_in_feed' && context === 'creation') {
    return 'surface_in_feed is not allowed during creation context.'
  }

  if (action.type === 'updateMemory' && (eventName || typeof action.payload?.suggestion === 'string' || typeof action.payload?.targetEntityId === 'string')) {
    return 'updateMemory cannot be combined with event, suggestion, or entity targeting payloads.'
  }

  if (action.type === 'askQuestion' && eventName) {
    return 'askQuestion cannot be combined with event dispatch payloads.'
  }

  if (action.type === 'sendMessage' && (eventName === 'prepare_share' || eventName === 'surface_in_feed')) {
    return 'sendMessage cannot dispatch high-risk feed or share events directly.'
  }

  return undefined
}

function isRepeatedActionWithinCooldown(action: EntityAction, options: ValidateActionOptions, now: string) {
  const previousActionAt = getTimestampMs(options.previousActionAt)
  const currentActionAt = getTimestampMs(now)
  if (!previousActionAt || !currentActionAt || currentActionAt - previousActionAt >= (options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS)) {
    return false
  }

  return typeof options.previousActionType === 'string' && options.previousActionType === action.type
}

export function clampIntensity(action: EntityAction, maxConfidence = DEFAULT_MAX_CONFIDENCE): EntityAction {
  const safeInput = normalizeCognitiveInput({
    confidence: action.confidence,
    context: action.payload,
  })

  return {
    ...action,
    payload: safeInput.context,
    confidence: clamp(safeInput.confidence, 0, maxConfidence),
    priority: safeInput.confidence > maxConfidence && action.priority === 'high' ? 'medium' : action.priority,
  }
}

export function fallbackBehavior(
  action: EntityAction,
  reason = 'FlowMind guard fallback.',
  now = '2026-01-01T00:00:00.000Z',
): EntityAction {
  return {
    ...action,
    type: 'observeContext',
    source: {
      ...action.source,
      intent: 'observe',
      strategy: 'guardrail',
    },
    payload: {
      ...action.payload,
      message: 'Observar contexto antes de agir.',
      metadata: {
        fallbackReason: reason,
        originalType: action.type,
        safeDecision: {
          intent: 'observe',
          action: 'none',
        },
      },
    },
    priority: 'low',
    confidence: Math.min(action.confidence, 0.42),
    createdAt: now,
  }
}

export function validateAction(action: EntityAction, options: ValidateActionOptions = {}): FlowMindGuardResult {
  const safeInput = normalizeCognitiveInput({
    confidence: action.confidence,
    context: action.payload,
  })
  const safeAction: EntityAction = {
    ...action,
    payload: safeInput.context,
    confidence: safeInput.confidence,
    createdAt: action.createdAt ?? options.now ?? '2026-01-01T00:00:00.000Z',
  }
  const allowedTypes = resolveAllowedTypes(options)
  const now = options.now ?? safeAction.createdAt
  const maxConfidence = options.maxConfidence ?? DEFAULT_MAX_CONFIDENCE
  const intensityClamped = clampIntensity(safeAction, maxConfidence)
  const safeDecision: FlowMindSafeDecision = {
    intent: 'observe',
    action: 'none',
  }

  if (!allowedTypes.includes(safeAction.type)) {
    const reason = `Action type "${safeAction.type}" is not allowed.`
    return {
      action: fallbackBehavior(intensityClamped, reason, now),
      allowed: false,
      reason,
      failureKind: 'policy',
      failureCode: 'FLOWMIND_ACTION_POLICY_DENIED',
      safeDecision,
    }
  }

  const unsafeCombinationReason = hasUnsafeCombination(safeAction, options.policyContext)
  if (unsafeCombinationReason) {
    return {
      action: fallbackBehavior(intensityClamped, unsafeCombinationReason, now),
      allowed: false,
      reason: unsafeCombinationReason,
      failureKind: 'policy',
      failureCode: 'FLOWMIND_ACTION_UNSAFE_COMBINATION',
      safeDecision,
    }
  }

  if (isRepeatedActionWithinCooldown(safeAction, options, now)) {
    const reason = 'Repeated action blocked by cooldown.'
    return {
      action: fallbackBehavior(intensityClamped, reason, now),
      allowed: false,
      reason,
      failureKind: 'conflict',
      failureCode: 'FLOWMIND_ACTION_CONFLICT',
      safeDecision,
    }
  }

  if (safeAction.priority === 'high' && safeAction.confidence < 0.52) {
    const reason = 'High priority action has insufficient confidence.'
    return {
      action: fallbackBehavior(intensityClamped, reason, now),
      allowed: false,
      reason,
      failureKind: 'validation',
      failureCode: 'FLOWMIND_ACTION_VALIDATION_FAILED',
      safeDecision,
    }
  }

  return {
    action: intensityClamped,
    allowed: true,
  }
}
