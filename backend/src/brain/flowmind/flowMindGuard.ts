import type { EntityAction } from '../domain/entity/contracts/EntityAction.js'

const DEFAULT_ALLOWED_TYPES = [
  'sendMessage',
  'suggestProduct',
  'suggestDiscovery',
  'askQuestion',
  'triggerExport',
  'triggerEvent',
  'updateMemory',
  'entityInteraction',
] as const

const DEFAULT_MAX_CONFIDENCE = 0.92
const DEFAULT_MIN_INTERVAL_MS = 12_000

type ValidateActionOptions = {
  allowedTypes?: string[]
  now?: string
  maxConfidence?: number
  minIntervalMs?: number
  previousActionAt?: string
}

export type FlowMindGuardResult = {
  action: EntityAction
  allowed: boolean
  reason?: string
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

export function clampIntensity(action: EntityAction, maxConfidence = DEFAULT_MAX_CONFIDENCE): EntityAction {
  return {
    ...action,
    confidence: clamp(action.confidence, 0, maxConfidence),
    priority: action.confidence > maxConfidence && action.priority === 'high' ? 'medium' : action.priority,
  }
}

export function fallbackBehavior(
  action: EntityAction,
  reason = 'FlowMind guard fallback.',
  now = new Date().toISOString(),
): EntityAction {
  return {
    ...action,
    type: 'triggerEvent',
    payload: {
      ...action.payload,
      eventName: 'observe_context',
      message: 'Observar contexto antes de agir.',
      metadata: {
        fallbackReason: reason,
        originalType: action.type,
      },
    },
    priority: 'low',
    confidence: Math.min(action.confidence, 0.42),
    createdAt: now,
  }
}

export function validateAction(action: EntityAction, options: ValidateActionOptions = {}): FlowMindGuardResult {
  const allowedTypes = options.allowedTypes ?? [...DEFAULT_ALLOWED_TYPES]
  const now = options.now ?? action.createdAt
  const maxConfidence = options.maxConfidence ?? DEFAULT_MAX_CONFIDENCE
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  const intensityClamped = clampIntensity(action, maxConfidence)

  if (!allowedTypes.includes(action.type)) {
    const reason = `Action type "${action.type}" is not allowed.`
    return {
      action: fallbackBehavior(intensityClamped, reason, now),
      allowed: false,
      reason,
    }
  }

  const previousActionAt = getTimestampMs(options.previousActionAt)
  const currentActionAt = getTimestampMs(now)

  if (previousActionAt && currentActionAt && currentActionAt - previousActionAt < minIntervalMs) {
    const reason = 'Action frequency exceeded safe interval.'
    return {
      action: fallbackBehavior(intensityClamped, reason, now),
      allowed: false,
      reason,
    }
  }

  if (action.priority === 'high' && action.confidence < 0.52) {
    const reason = 'High priority action has insufficient confidence.'
    return {
      action: fallbackBehavior(intensityClamped, reason, now),
      allowed: false,
      reason,
    }
  }

  return {
    action: intensityClamped,
    allowed: true,
  }
}
