import type { ObservabilityService } from '../../../services/observabilityService.js'
import type { CaseRecord, CaseStatus } from '../../legalCases/caseTypes.js'
import type { GrowthEvidence } from '../GrowthEvidence.js'
import type { GrowthProfessionalContext } from '../GrowthContext.js'
import { createGrowthMetrics } from '../GrowthMetrics.js'
import type {
  GrowthCapacityProjection,
  GrowthCapacityStatus,
  GrowthCityKey,
  GrowthSpecialtyKey,
} from '../GrowthTypes.js'
import type { CapacityCaseCounters, CapacityEngineInput, CapacityRecommendation } from './CapacityTypes.js'
import type { CapacityEngineResult } from './CapacityProjection.js'

const CLOSED_CASE_STATUSES = new Set<CaseStatus>(['resolved', 'closed'])
const EXCLUDED_CASE_STATUSES = new Set<CaseStatus>(['archived'])

function normalizeText(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : undefined
}

function normalizeCity(value: string | undefined | null) {
  return normalizeText(value)?.toLowerCase()
}

function normalizeSpecialty(value: string | undefined | null) {
  return normalizeText(value)?.toLowerCase()
}

function buildProjectionId(args: {
  tenantId: number
  officeId: string
  professionalId?: string
  city?: string
  specialty?: string
}) {
  return [
    args.tenantId,
    args.officeId,
    args.professionalId ?? 'unknown',
    args.city ?? 'unknown',
    args.specialty ?? 'unknown',
  ].join(':')
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function isClosedCase(legalCase: CaseRecord) {
  return CLOSED_CASE_STATUSES.has(legalCase.status)
}

function isExcludedCase(legalCase: CaseRecord) {
  return EXCLUDED_CASE_STATUSES.has(legalCase.status)
}

function isOpenCase(legalCase: CaseRecord) {
  return !isClosedCase(legalCase) && !isExcludedCase(legalCase)
}

function dateToMs(value: string | undefined) {
  if (!value) {
    return Number.NaN
  }

  return new Date(value).getTime()
}

function isWithinPeriod(value: string | undefined, period: CapacityEngineInput['period']) {
  const timestamp = dateToMs(value)
  if (Number.isNaN(timestamp)) {
    return false
  }

  const startsAt = new Date(period.startsAt).getTime()
  const endsAt = new Date(period.endsAt).getTime()
  return timestamp >= startsAt && timestamp <= endsAt
}

function filterCases(input: CapacityEngineInput) {
  return (input.cases ?? []).filter((legalCase) => {
    if (legalCase.entityId && legalCase.entityId !== input.officeId) {
      return false
    }

    if (isExcludedCase(legalCase)) {
      return false
    }

    return isWithinPeriod(legalCase.openedAt, input.period)
  })
}

function collectProjectionKeys(args: {
  cases: CaseRecord[]
  professionals?: GrowthProfessionalContext[]
}) {
  const keys = new Set<string>()

  for (const professional of args.professionals ?? []) {
    keys.add(professional.id)
  }

  for (const legalCase of args.cases) {
    if (legalCase.leadProfessionalId) {
      keys.add(legalCase.leadProfessionalId)
    }
  }

  return [...keys].sort((left, right) => left.localeCompare(right, 'pt-BR'))
}

function calculateCaseCounters(cases: CaseRecord[]): CapacityCaseCounters {
  let workloadCount = 0
  let backlogCount = 0
  let openCasesCount = 0
  let closedCasesCount = 0
  let totalResolutionHours = 0
  let resolutionSamples = 0

  for (const legalCase of cases) {
    if (isExcludedCase(legalCase)) {
      continue
    }

    workloadCount += 1

    if (isOpenCase(legalCase)) {
      backlogCount += 1
      openCasesCount += 1
    } else if (isClosedCase(legalCase)) {
      closedCasesCount += 1
      const openedAt = dateToMs(legalCase.openedAt)
      const closedAt = dateToMs(legalCase.closedAt)

      if (!Number.isNaN(openedAt) && !Number.isNaN(closedAt) && closedAt >= openedAt) {
        totalResolutionHours += (closedAt - openedAt) / (1000 * 60 * 60)
        resolutionSamples += 1
      }
    }
  }

  return {
    workloadCount,
    backlogCount,
    openCasesCount,
    closedCasesCount,
    totalResolutionHours,
    resolutionSamples,
  }
}

function calculateCapacityStatus(args: {
  counters: CapacityCaseCounters
  professional?: GrowthProfessionalContext
  hasCaseData: boolean
}): GrowthCapacityStatus {
  if (!args.professional && !args.hasCaseData) {
    return 'unknown'
  }

  if (args.professional && args.professional.status && args.professional.status !== 'active' && !args.hasCaseData) {
    return 'unknown'
  }

  const openCasesCount = args.counters.openCasesCount
  if (openCasesCount <= 2) {
    return 'available'
  }
  if (openCasesCount <= 5) {
    return 'balanced'
  }
  if (openCasesCount <= 8) {
    return 'constrained'
  }
  return 'overloaded'
}

function calculateCapacityScore(status: GrowthCapacityStatus) {
  switch (status) {
    case 'available':
      return 100
    case 'balanced':
      return 70
    case 'constrained':
      return 40
    case 'overloaded':
      return 10
    default:
      return 25
  }
}

function calculateRecommendation(status: GrowthCapacityStatus): CapacityRecommendation {
  switch (status) {
    case 'available':
      return 'pode_crescer'
    case 'balanced':
      return 'manter'
    case 'constrained':
      return 'reduzir_demanda'
    case 'overloaded':
      return 'contratar'
    default:
      return 'sem_dados_suficientes'
  }
}

function pickDominantValue(
  values: Array<string | undefined>,
  fallback?: string,
): string | undefined {
  const buckets = new Map<string, { display: string; count: number }>()

  for (const value of values) {
    const display = normalizeText(value)
    if (!display) {
      continue
    }

    const key = display.toLowerCase()
    const current = buckets.get(key)
    if (current) {
      current.count += 1
      if (display.localeCompare(current.display, 'pt-BR') < 0) {
        current.display = display
      }
      continue
    }

    buckets.set(key, { display, count: 1 })
  }

  const ranked = [...buckets.values()].sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count
    }

    return left.display.localeCompare(right.display, 'pt-BR')
  })

  return ranked[0]?.display ?? normalizeText(fallback)
}

function resolveCity(args: {
  professional?: GrowthProfessionalContext
  cases: CaseRecord[]
}): GrowthCityKey | undefined {
  const professionalCity = normalizeText(args.professional?.city)
  if (professionalCity) {
    return professionalCity
  }

  return pickDominantValue(args.cases.map((legalCase) => legalCase.clientCanonicalCity ?? legalCase.clientDisplayCity))
}

function resolveSpecialty(args: {
  professional?: GrowthProfessionalContext
  cases: CaseRecord[]
}): GrowthSpecialtyKey | undefined {
  const sortedSpecialties = [...(args.professional?.specialties ?? [])]
    .map((specialty) => normalizeText(specialty))
    .filter((specialty): specialty is string => Boolean(specialty))
    .sort((left, right) => left.localeCompare(right, 'pt-BR'))

  if (sortedSpecialties.length > 0) {
    return sortedSpecialties[0]
  }

  return pickDominantValue(args.cases.map((legalCase) => legalCase.practiceArea))
}

function buildEvidenceForProjection(projection: GrowthCapacityProjection, generatedAt: string): GrowthEvidence[] {
  return [
    {
      id: `${projection.id}:workload_count`,
      type: 'capacity_signal',
      source: 'legal_growth',
      description: `Profissional ${projection.professionalId ?? 'unknown'} com ${projection.openCasesCount} casos abertos.`,
      weight: 1,
      period: projection.period,
      city: projection.city,
      specialty: projection.specialty,
      professionalId: projection.professionalId,
      metric: 'workload_count',
      value: projection.workloadCount,
      createdAt: generatedAt,
    },
    {
      id: `${projection.id}:capacity_score`,
      type: 'derived_metric',
      source: 'legal_growth',
      description: `Capacidade ${projection.capacityStatus} com score ${projection.capacityScore}.`,
      weight: 0.8,
      period: projection.period,
      city: projection.city,
      specialty: projection.specialty,
      professionalId: projection.professionalId,
      metric: 'capacity_score',
      value: projection.capacityScore,
      createdAt: generatedAt,
    },
  ]
}

export function buildCapacityProjections(input: CapacityEngineInput): CapacityEngineResult {
  const scopedCases = filterCases(input)
  const projectionKeys = collectProjectionKeys({
    cases: scopedCases,
    professionals: input.professionals,
  })

  if (projectionKeys.length === 0) {
    return {
      projections: [],
      evidence: [],
    }
  }

  const professionalsById = new Map((input.professionals ?? []).map((professional) => [professional.id, professional]))
  const projections: GrowthCapacityProjection[] = []
  const evidence: GrowthEvidence[] = []

  for (const professionalId of projectionKeys) {
    const professional = professionalsById.get(professionalId)
    const professionalCases = scopedCases.filter((legalCase) => legalCase.leadProfessionalId === professionalId)
    const counters = calculateCaseCounters(professionalCases)
    const capacityStatus = calculateCapacityStatus({
      counters,
      professional,
      hasCaseData: professionalCases.length > 0,
    })

    const projection: GrowthCapacityProjection = {
      id: buildProjectionId({
        tenantId: input.tenantId,
        officeId: input.officeId,
        professionalId,
        city: resolveCity({ professional, cases: professionalCases }),
        specialty: resolveSpecialty({ professional, cases: professionalCases }),
      }),
      officeId: input.officeId,
      tenantId: input.tenantId,
      period: input.period,
      professionalId,
      city: resolveCity({ professional, cases: professionalCases }),
      specialty: resolveSpecialty({ professional, cases: professionalCases }),
      workloadCount: counters.workloadCount,
      backlogCount: counters.backlogCount,
      openCasesCount: counters.openCasesCount,
      closedCasesCount: counters.closedCasesCount,
      averageResolutionHours:
        counters.resolutionSamples > 0
          ? Number((counters.totalResolutionHours / counters.resolutionSamples).toFixed(2))
          : null,
      capacityScore: clampScore(calculateCapacityScore(capacityStatus)),
      capacityStatus,
      recommendation: calculateRecommendation(capacityStatus),
      evidenceIds: [],
    }

    const projectionEvidence = buildEvidenceForProjection(projection, input.period.endsAt)
    projection.evidenceIds = projectionEvidence.map((entry) => entry.id)
    projections.push(projection)
    evidence.push(...projectionEvidence)
  }

  projections.sort((left, right) => {
    const leftCity = normalizeCity(left.city) ?? ''
    const rightCity = normalizeCity(right.city) ?? ''
    if (leftCity !== rightCity) {
      return leftCity.localeCompare(rightCity, 'pt-BR')
    }

    const leftSpecialty = normalizeSpecialty(left.specialty) ?? ''
    const rightSpecialty = normalizeSpecialty(right.specialty) ?? ''
    if (leftSpecialty !== rightSpecialty) {
      return leftSpecialty.localeCompare(rightSpecialty, 'pt-BR')
    }

    return (left.professionalId ?? '').localeCompare(right.professionalId ?? '', 'pt-BR')
  })

  return {
    projections,
    evidence,
  }
}

export class CapacityEngine {
  private readonly metrics

  constructor(observability?: ObservabilityService) {
    this.metrics = createGrowthMetrics(observability)
  }

  build(input: CapacityEngineInput): CapacityEngineResult {
    const startedAt = Date.now()

    try {
      const result = buildCapacityProjections(input)
      this.metrics.recordCapacityProjectionTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
      })
      return result
    } catch (error) {
      this.metrics.recordCapacityProjectionTiming({
        tenantId: input.tenantId,
        officeId: input.officeId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createCapacityEngine(observability?: ObservabilityService) {
  return new CapacityEngine(observability)
}
