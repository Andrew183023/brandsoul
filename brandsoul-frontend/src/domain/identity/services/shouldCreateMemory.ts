import type { BrandSoulMemoryContent, BrandSoulMemorySource } from '../contracts/BrandSoulMemory'
import type { BrandSoulMemoryType } from '../contracts/BrandSoulMemorySnapshot'

export type BrandSoulMemoryCandidateInput = {
  type: BrandSoulMemoryType
  content?: BrandSoulMemoryContent | null
  relevanceScore: number
  source: BrandSoulMemorySource
  isDuplicate?: boolean
  duplicateSource?: 'context' | 'batch' | 'unknown'
  containsSensitiveData?: boolean
  isRawLog?: boolean
  contextActive?: boolean
}

export type BrandSoulMemoryCreationRejectionReason =
  | 'duplicate-memory'
  | 'duplicate-memory-context'
  | 'duplicate-memory-batch'
  | 'sensitive-data'
  | 'raw-log'
  | 'missing-structured-content'
  | 'below-relevance-threshold'
  | 'inactive-context'
  | 'low-confidence-identity-inference'

export type BrandSoulMemoryCreationDecision = {
  accepted: boolean
  reasons: BrandSoulMemoryCreationRejectionReason[]
}

const MIN_RELEVANCE_BY_SOURCE: Record<BrandSoulMemorySource, number> = {
  user: 0.45,
  system: 0.5,
  inference: 0.7,
}

function hasStructuredContent(content?: BrandSoulMemoryContent | null) {
  if (!content) {
    return false
  }

  return content.subject.trim().length > 0 && content.signal.trim().length > 0 && Object.keys(content.attributes).length > 0
}

export function evaluateBrandSoulMemoryCandidate(candidate: BrandSoulMemoryCandidateInput): BrandSoulMemoryCreationDecision {
  const reasons: BrandSoulMemoryCreationRejectionReason[] = []

  if (candidate.isDuplicate) {
    reasons.push(
      candidate.duplicateSource === 'context'
        ? 'duplicate-memory-context'
        : candidate.duplicateSource === 'batch'
          ? 'duplicate-memory-batch'
          : 'duplicate-memory',
    )
  }

  if (candidate.containsSensitiveData) {
    reasons.push('sensitive-data')
  }

  if (candidate.isRawLog) {
    reasons.push('raw-log')
  }

  if (!hasStructuredContent(candidate.content)) {
    reasons.push('missing-structured-content')
  }

  if (candidate.relevanceScore < MIN_RELEVANCE_BY_SOURCE[candidate.source]) {
    reasons.push('below-relevance-threshold')
  }

  if (candidate.type === 'contextual' && !candidate.contextActive) {
    reasons.push('inactive-context')
  }

  if (candidate.type === 'identity' && candidate.source === 'inference' && candidate.relevanceScore < 0.85) {
    reasons.push('low-confidence-identity-inference')
  }

  return {
    accepted: reasons.length === 0,
    reasons,
  }
}

export function shouldCreateMemory(candidate: BrandSoulMemoryCandidateInput) {
  return evaluateBrandSoulMemoryCandidate(candidate).accepted
}