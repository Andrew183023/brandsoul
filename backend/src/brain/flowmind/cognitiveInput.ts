type NormalizableCognitiveInput = Record<string, unknown> & {
  engagementScore?: unknown
  confidence?: unknown
  context?: unknown
}

export type NormalizedCognitiveInput<T extends NormalizableCognitiveInput = NormalizableCognitiveInput> = Omit<T, 'engagementScore' | 'confidence' | 'context'> & {
  engagementScore: number
  confidence: number
  context: Record<string, unknown>
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

export function normalizeCognitiveInput<T extends NormalizableCognitiveInput>(input?: T): NormalizedCognitiveInput<T> {
  const safeInput = (input ?? {}) as T

  return {
    ...safeInput,
    engagementScore: readNumber(safeInput.engagementScore, 0),
    confidence: readNumber(safeInput.confidence, 0),
    context: readRecord(safeInput.context),
  }
}