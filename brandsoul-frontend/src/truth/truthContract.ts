export type FrontendTruthType = 'AUTHORITATIVE' | 'ADVISORY' | 'PROJECTED' | 'SYNTHETIC'

export type FrontendCausalityLevel =
  | 'CAUSAL'
  | 'DERIVED'
  | 'INFERRED'
  | 'RECONSTRUCTED'
  | 'HEURISTIC'
  | 'MOCK'

export type FrontendAuthorityLevel =
  | 'RUNTIME'
  | 'GOVERNANCE'
  | 'OPERATOR'
  | 'FRONTEND'
  | 'LOCAL_FALLBACK'
  | 'PROJECTION_ENGINE'

export type FrontendTruthContract = {
  truthType: FrontendTruthType
  causalityLevel: FrontendCausalityLevel
  authorityLevel: FrontendAuthorityLevel
  replaySafe: boolean
  persisted: boolean
  synthetic: boolean
  advisory: boolean
  projected: boolean
  sourceService: string
  lineageId: string
  causalityId: string
  generatedAt: string
  confidence: number
  authoritativeActor: string
}

export type FrontendTruthEnvelope = {
  truthContract?: FrontendTruthContract
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTruthyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

export function isFrontendTruthContract(value: unknown): value is FrontendTruthContract {
  if (!isRecord(value)) {
    return false
  }

  return isTruthyString(value.truthType)
    && isTruthyString(value.causalityLevel)
    && isTruthyString(value.authorityLevel)
    && typeof value.replaySafe === 'boolean'
    && typeof value.persisted === 'boolean'
    && typeof value.synthetic === 'boolean'
    && typeof value.advisory === 'boolean'
    && typeof value.projected === 'boolean'
    && isTruthyString(value.sourceService)
    && isTruthyString(value.lineageId)
    && isTruthyString(value.causalityId)
    && isTruthyString(value.generatedAt)
    && typeof value.confidence === 'number'
    && Number.isFinite(value.confidence)
    && value.confidence >= 0
    && value.confidence <= 1
    && isTruthyString(value.authoritativeActor)
}

export function readFrontendTruthContract(value: unknown): FrontendTruthContract | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const contract = value.truthContract
  return isFrontendTruthContract(contract) ? contract : undefined
}

export function classifyTruthType(contract?: FrontendTruthContract): FrontendTruthType {
  if (!contract) {
    return 'SYNTHETIC'
  }

  if (contract.truthType === 'AUTHORITATIVE') {
    return 'AUTHORITATIVE'
  }

  if (contract.truthType === 'PROJECTED' || contract.projected) {
    return 'PROJECTED'
  }

  if (contract.truthType === 'ADVISORY' || contract.advisory) {
    return 'ADVISORY'
  }

  return 'SYNTHETIC'
}

export function resolveTruthLabel(truthType: FrontendTruthType) {
  if (truthType === 'AUTHORITATIVE') return 'AUTHORITATIVE'
  if (truthType === 'ADVISORY') return 'ADVISORY'
  if (truthType === 'PROJECTED') return 'PROJECTED'
  return 'SYNTHETIC'
}
