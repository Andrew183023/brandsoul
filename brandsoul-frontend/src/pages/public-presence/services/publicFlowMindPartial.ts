import type { PublicFlowMindPartialConfig } from '../../../domain/entity/contracts/PublicPresenceResponse'
import type { PublicFlowMindPartialTelemetryPayload } from '../../../backend-bridge/api/publicFlowMindPartialApi'
import type {
  PublicFlowMindShadowBackendDecision,
  PublicFlowMindShadowFrontendDecision,
} from '../../../backend-bridge/api/publicFlowMindShadowApi'

type PublicFlowMindComparison = {
  divergenceScore: number
  responseTextSimilarity: number
  intentChanged: boolean
  actionChanged: boolean
  authorityChanged: boolean
}

export type PublicFlowMindPartialResolution = {
  responseText: string
  engineUsed: 'frontend' | 'flowmind'
  fallbackOccurred: boolean
  fallbackReason?: 'backend-unavailable' | 'backend-disabled' | 'backend-latency-too-high' | 'critical-inconsistency' | 'flowmind-reported-fallback'
  comparison?: PublicFlowMindComparison
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

function buildTokenSet(value: string) {
  const normalized = normalizeText(value)
  return new Set(normalized.length === 0 ? [] : normalized.split(' '))
}

function computeResponseTextSimilarity(left: string, right: string) {
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

  return roundMetric(intersectionSize / unionSize)
}

function hashToBucket(seed: string) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100
  }

  return Math.abs(hash % 100)
}

export function computePublicFlowMindPartialRolloutBucket(requestId: string) {
  return hashToBucket(requestId)
}

export function shouldAttemptPublicFlowMindPartial(config: PublicFlowMindPartialConfig | undefined, requestId: string) {
  if (!config?.enabled || config.rolloutPercentage <= 0) {
    return false
  }

  return computePublicFlowMindPartialRolloutBucket(requestId) < config.rolloutPercentage
}

export function buildPublicFlowMindComparison(args: {
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision: PublicFlowMindShadowBackendDecision
}): PublicFlowMindComparison {
  const intentChanged = normalizeText(args.frontendDecision.intent) !== normalizeText(args.backendDecision.intent)
  const actionChanged = normalizeText(args.frontendDecision.action) !== normalizeText(args.backendDecision.action)
  const responseTextSimilarity = computeResponseTextSimilarity(
    args.frontendDecision.responseText,
    args.backendDecision.responseText,
  )
  const responseTextChanged = normalizeText(args.frontendDecision.responseText) !== normalizeText(args.backendDecision.responseText)
    && responseTextSimilarity < 0.94
  const authorityChanged = args.frontendDecision.authority.decisionSource !== args.backendDecision.authority.decisionSource
    || args.frontendDecision.authority.terminalAuthority !== args.backendDecision.authority.terminalAuthority
    || args.frontendDecision.authority.semanticFrozen !== args.backendDecision.authority.semanticFrozen
  const divergenceScore = roundMetric(clamp(
    (intentChanged ? 0.3 : 0)
      + (actionChanged ? 0.24 : 0)
      + (authorityChanged ? 0.2 : 0)
      + (responseTextChanged ? 0.14 + (1 - responseTextSimilarity) * 0.12 : 0)
      + (args.backendDecision.fallbackUsed ? 0.08 : 0),
  ))

  return {
    divergenceScore,
    responseTextSimilarity,
    intentChanged,
    actionChanged,
    authorityChanged,
  }
}

export function resolvePublicFlowMindPartialResponse(args: {
  config: PublicFlowMindPartialConfig
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision?: PublicFlowMindShadowBackendDecision
}): PublicFlowMindPartialResolution {
  if (!args.backendDecision) {
    return {
      responseText: args.frontendDecision.responseText,
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'backend-unavailable',
    }
  }

  const comparison = buildPublicFlowMindComparison({
    frontendDecision: args.frontendDecision,
    backendDecision: args.backendDecision,
  })
  const criticalInconsistency = comparison.intentChanged
    || comparison.actionChanged
    || comparison.authorityChanged
    || comparison.divergenceScore >= args.config.criticalDivergenceThreshold

  if (args.backendDecision.fallbackUsed) {
    return {
      responseText: args.frontendDecision.responseText,
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'flowmind-reported-fallback',
      comparison,
    }
  }

  if (args.backendDecision.latencyMs > args.config.latencyBudgetMs) {
    return {
      responseText: args.frontendDecision.responseText,
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'backend-latency-too-high',
      comparison,
    }
  }

  if (criticalInconsistency) {
    return {
      responseText: args.frontendDecision.responseText,
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'critical-inconsistency',
      comparison,
    }
  }

  return {
    responseText: args.backendDecision.responseText,
    engineUsed: 'flowmind',
    fallbackOccurred: false,
    comparison,
  }
}

export function buildPublicFlowMindPartialTelemetry(args: {
  requestId: string
  rolloutBucket: number
  config: PublicFlowMindPartialConfig
  frontendDecision: PublicFlowMindShadowFrontendDecision
  backendDecision?: PublicFlowMindShadowBackendDecision
  resolution: PublicFlowMindPartialResolution
  decidedAt?: string
}): PublicFlowMindPartialTelemetryPayload {
  return {
    version: 1,
    requestId: args.requestId,
    decidedAt: args.decidedAt ?? new Date().toISOString(),
    rolloutBucket: args.rolloutBucket,
    engineUsed: args.resolution.engineUsed,
    fallbackOccurred: args.resolution.fallbackOccurred,
    fallbackReason: args.resolution.fallbackReason,
    policy: args.config,
    frontendDecision: args.frontendDecision,
    backendDecision: args.backendDecision,
    metrics: {
      frontendLatencyMs: args.frontendDecision.latencyMs,
      backendLatencyMs: args.backendDecision?.latencyMs,
      chosenLatencyMs: args.resolution.engineUsed === 'flowmind'
        ? args.backendDecision?.latencyMs ?? args.frontendDecision.latencyMs
        : args.frontendDecision.latencyMs,
      divergenceScore: args.resolution.comparison?.divergenceScore,
    },
  }
}