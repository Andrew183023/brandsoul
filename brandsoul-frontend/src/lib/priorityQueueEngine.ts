import type { AdminLegalCase, OfficeBusinessConfig } from '../backend-bridge/api/adminApi'

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low'

export type QueuePriorityBreakdown = {
  urgencyWeight: number
  agingWeight: number
  silenceWeight: number
  slaWeight: number
  abandonmentWeight: number
}

export type QueuePriorityMetrics = {
  urgencyDeclared: 'critical' | 'priority' | 'planned' | 'unknown'
  caseAgeMinutes: number
  timeWithoutResponseMinutes: number
  slaTargetMinutes: number | null
  slaRemainingMinutes: number | null
  hasAssignedLawyer: boolean
}

export type QueuePriorityEntry = {
  caseItem: AdminLegalCase
  score: number
  level: PriorityLevel
  reasons: string[]
  breakdown: QueuePriorityBreakdown
  metrics: QueuePriorityMetrics
  computedAt: string
}

export type QueueEvaluationResult = {
  computedAt: string
  entries: QueuePriorityEntry[]
}

type QueueEvaluationOptions = {
  nowIso?: string
  officeConfig?: OfficeBusinessConfig | null
}

function parseDateToMillis(value: string) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toMinutes(deltaMs: number) {
  return Math.max(0, Math.round(deltaMs / 60_000))
}

function normalizeText(value?: string) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
}

function resolveUrgency(description: string, messages: AdminLegalCase['messages']): QueuePriorityMetrics['urgencyDeclared'] {
  const haystack = [description, ...messages.map((item) => item.text)].join('\n')
  const normalized = normalizeText(haystack)

  if (/urgencia\s*:\s*critica|urgencia\s*critica|\bcritica\b|\burgente\b|\b0-24h\b/.test(normalized)) {
    return 'critical'
  }

  if (/urgencia\s*:\s*prioritaria|urgencia\s*prioritaria|\bprioritaria\b|\bprioridade\b|\b24-72h\b/.test(normalized)) {
    return 'priority'
  }

  if (/urgencia\s*:\s*planejada|urgencia\s*planejada|\bplanejada\b|\b3-7 dias\b/.test(normalized)) {
    return 'planned'
  }

  return 'unknown'
}

function resolveUrgencyWeight(urgency: QueuePriorityMetrics['urgencyDeclared']) {
  if (urgency === 'critical') {
    return 36
  }

  if (urgency === 'priority') {
    return 24
  }

  if (urgency === 'planned') {
    return 12
  }

  return 6
}

function resolveSlaTargetMinutes(config?: OfficeBusinessConfig | null) {
  const avgResponse = config?.avgResponseMinutes
  if (typeof avgResponse === 'number' && Number.isFinite(avgResponse) && avgResponse > 0) {
    return Math.round(avgResponse)
  }

  const label = normalizeText(config?.serviceRules?.responseWindowLabel)
  if (!label) {
    return null
  }

  const hourMatch = label.match(/(\d+)\s*h/)
  if (hourMatch) {
    const hours = Number.parseInt(hourMatch[1] ?? '0', 10)
    if (hours > 0) {
      return hours * 60
    }
  }

  const minuteMatch = label.match(/(\d+)\s*min/)
  if (minuteMatch) {
    const minutes = Number.parseInt(minuteMatch[1] ?? '0', 10)
    if (minutes > 0) {
      return minutes
    }
  }

  const anyNumber = label.match(/(\d+)/)
  if (anyNumber) {
    const numeric = Number.parseInt(anyNumber[1] ?? '0', 10)
    if (numeric > 0) {
      return numeric
    }
  }

  return null
}

function resolveAgingWeight(caseAgeMinutes: number) {
  return clamp(Math.floor(caseAgeMinutes / 120) * 2, 0, 22)
}

function resolveSilenceWeight(timeWithoutResponseMinutes: number) {
  return clamp(Math.floor(timeWithoutResponseMinutes / 60) * 3, 0, 24)
}

function resolveSlaWeight(timeWithoutResponseMinutes: number, slaTargetMinutes: number | null) {
  if (!slaTargetMinutes || slaTargetMinutes <= 0) {
    return 0
  }

  const ratio = timeWithoutResponseMinutes / slaTargetMinutes
  if (ratio < 0.7) {
    return 0
  }

  if (ratio < 1) {
    return 8
  }

  if (ratio < 1.5) {
    return 18
  }

  if (ratio < 2) {
    return 24
  }

  return 30
}

function resolveAbandonmentWeight(args: {
  urgency: QueuePriorityMetrics['urgencyDeclared']
  caseAgeMinutes: number
  timeWithoutResponseMinutes: number
  hasAssignedLawyer: boolean
  slaTargetMinutes: number | null
}) {
  let score = 0

  if (!args.hasAssignedLawyer) {
    score += 8
  }

  if (args.urgency === 'critical') {
    score += 8
  } else if (args.urgency === 'priority') {
    score += 4
  }

  if (args.timeWithoutResponseMinutes >= 180) {
    score += 8
  } else if (args.timeWithoutResponseMinutes >= 60) {
    score += 4
  }

  if (args.caseAgeMinutes >= 1_440) {
    score += 6
  }

  if (args.slaTargetMinutes && args.timeWithoutResponseMinutes > args.slaTargetMinutes) {
    score += 8
  }

  return clamp(score, 0, 26)
}

function resolvePriorityLevel(score: number): PriorityLevel {
  if (score >= 80) {
    return 'critical'
  }

  if (score >= 58) {
    return 'high'
  }

  if (score >= 34) {
    return 'medium'
  }

  return 'low'
}

function buildReasons(args: {
  urgency: QueuePriorityMetrics['urgencyDeclared']
  caseAgeMinutes: number
  timeWithoutResponseMinutes: number
  slaTargetMinutes: number | null
  slaRemainingMinutes: number | null
  hasAssignedLawyer: boolean
  level: PriorityLevel
}) {
  const reasons: string[] = []

  reasons.push(
    args.urgency === 'critical'
      ? 'Urgencia declarada critica.'
      : args.urgency === 'priority'
        ? 'Urgencia declarada prioritaria.'
        : args.urgency === 'planned'
          ? 'Urgencia declarada planejada.'
          : 'Urgencia nao declarada explicitamente.',
  )

  if (!args.hasAssignedLawyer) {
    reasons.push('Caso ainda sem advogado atribuido.')
  }

  if (args.slaTargetMinutes) {
    if (typeof args.slaRemainingMinutes === 'number' && args.slaRemainingMinutes < 0) {
      reasons.push(`SLA estourado em ${Math.abs(args.slaRemainingMinutes)} min.`)
    } else if (typeof args.slaRemainingMinutes === 'number') {
      reasons.push(`SLA restante de ${args.slaRemainingMinutes} min.`)
    }
  } else {
    reasons.push('SLA de resposta nao configurado para este escritorio.')
  }

  if (args.timeWithoutResponseMinutes >= 60) {
    reasons.push(`Sem resposta ha ${args.timeWithoutResponseMinutes} min.`)
  }

  if (args.caseAgeMinutes >= 720) {
    reasons.push(`Caso aberto ha ${args.caseAgeMinutes} min.`)
  }

  if (args.level === 'critical') {
    reasons.push('Risco elevado de abandono sem acao imediata.')
  }

  return reasons
}

function resolveTimeWithoutResponseMinutes(caseItem: AdminLegalCase, nowMs: number) {
  const lawyerMessages = caseItem.messages
    .filter((item) => item.role === 'lawyer')
    .map((item) => parseDateToMillis(item.createdAt))
    .filter((value) => value > 0)

  const referenceMs = lawyerMessages.length > 0
    ? Math.max(...lawyerMessages)
    : parseDateToMillis(caseItem.createdAt)

  return toMinutes(nowMs - referenceMs)
}

export function evaluatePriorityQueue(
  cases: AdminLegalCase[],
  options: QueueEvaluationOptions = {},
): QueueEvaluationResult {
  const computedAt = options.nowIso ?? new Date().toISOString()
  const nowMs = parseDateToMillis(computedAt)
  const slaTargetMinutes = resolveSlaTargetMinutes(options.officeConfig)

  const entries = cases.map((caseItem) => {
    const caseAgeMinutes = toMinutes(nowMs - parseDateToMillis(caseItem.createdAt))
    const timeWithoutResponseMinutes = resolveTimeWithoutResponseMinutes(caseItem, nowMs)
    const urgency = resolveUrgency(caseItem.description, caseItem.messages)
    const hasAssignedLawyer = caseItem.isAssigned || Boolean(caseItem.assignedProfessionalId ?? caseItem.assignedLawyerId)

    const urgencyWeight = resolveUrgencyWeight(urgency)
    const agingWeight = resolveAgingWeight(caseAgeMinutes)
    const silenceWeight = resolveSilenceWeight(timeWithoutResponseMinutes)
    const slaWeight = resolveSlaWeight(timeWithoutResponseMinutes, slaTargetMinutes)
    const abandonmentWeight = resolveAbandonmentWeight({
      urgency,
      caseAgeMinutes,
      timeWithoutResponseMinutes,
      hasAssignedLawyer,
      slaTargetMinutes,
    })

    const score = urgencyWeight + agingWeight + silenceWeight + slaWeight + abandonmentWeight
    const level = resolvePriorityLevel(score)
    const slaRemainingMinutes = slaTargetMinutes == null ? null : slaTargetMinutes - timeWithoutResponseMinutes

    return {
      caseItem,
      score,
      level,
      computedAt,
      reasons: buildReasons({
        urgency,
        caseAgeMinutes,
        timeWithoutResponseMinutes,
        slaTargetMinutes,
        slaRemainingMinutes,
        hasAssignedLawyer,
        level,
      }),
      breakdown: {
        urgencyWeight,
        agingWeight,
        silenceWeight,
        slaWeight,
        abandonmentWeight,
      },
      metrics: {
        urgencyDeclared: urgency,
        caseAgeMinutes,
        timeWithoutResponseMinutes,
        slaTargetMinutes,
        slaRemainingMinutes,
        hasAssignedLawyer,
      },
    } satisfies QueuePriorityEntry
  })

  entries.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    const rightSilence = right.metrics.timeWithoutResponseMinutes
    const leftSilence = left.metrics.timeWithoutResponseMinutes
    if (rightSilence !== leftSilence) {
      return rightSilence - leftSilence
    }

    return parseDateToMillis(left.caseItem.createdAt) - parseDateToMillis(right.caseItem.createdAt)
  })

  return {
    computedAt,
    entries,
  }
}

export function formatDurationMinutes(totalMinutes: number) {
  const clampedMinutes = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(clampedMinutes / 60)
  const minutes = clampedMinutes % 60

  if (hours === 0) {
    return `${minutes} min`
  }

  if (minutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${minutes}min`
}

export function formatPriorityLevel(level: PriorityLevel) {
  if (level === 'critical') {
    return 'CRITICO'
  }

  if (level === 'high') {
    return 'ALTO'
  }

  if (level === 'medium') {
    return 'MEDIO'
  }

  return 'BAIXO'
}
