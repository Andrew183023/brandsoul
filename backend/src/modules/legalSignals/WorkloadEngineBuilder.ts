import type { OperationalSnapshotDistribution } from './OperationalSnapshot.js'
import type {
  ProfessionalWorkloadCaseInput,
  ProfessionalWorkloadProjection,
  WorkloadEngineBuildInput,
  WorkloadLevel,
} from './WorkloadEngine.js'

type WorkloadAccumulator = {
  tenantId: number
  entityId: string
  professionalId: string
  activeCases: number
  totalCases: number
  closedCases: number
  resolutionHours: number[]
  firstResponseMinutes: number[]
  slaRiskScores: number[]
  criticalCases: number
  delayedCases: number
  waitingResponseCases: number
  slaWarningCases: number
  slaBreachedCases: number
  practiceAreas: OperationalSnapshotDistribution
  cities: OperationalSnapshotDistribution
  generatedAt: string
}

function normalizeKey(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function isClosedCase(legalCase: ProfessionalWorkloadCaseInput) {
  return legalCase.status === 'closed' || legalCase.status === 'resolved'
}

function isFiniteMetric(value?: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100
}

function average(values: number[]) {
  if (values.length === 0) {
    return null
  }

  return roundMetric(values.reduce((total, current) => total + current, 0) / values.length)
}

function getSlaRiskScore(slaStatus?: ProfessionalWorkloadCaseInput['slaStatus']) {
  switch (slaStatus) {
    case 'ok':
      return 0
    case 'warning':
      return 50
    case 'breach':
      return 100
    default:
      return null
  }
}

function getWorkloadLevel(activeCases: number): WorkloadLevel {
  if (activeCases === 0) {
    return 'idle'
  }
  if (activeCases <= 9) {
    return 'normal'
  }
  if (activeCases <= 17) {
    return 'high'
  }
  return 'overloaded'
}

function compareWorkloadProjection(left: ProfessionalWorkloadProjection, right: ProfessionalWorkloadProjection) {
  if (left.professionalId !== right.professionalId) {
    return left.professionalId.localeCompare(right.professionalId)
  }

  if (left.activeCases !== right.activeCases) {
    return right.activeCases - left.activeCases
  }

  return left.generatedAt.localeCompare(right.generatedAt)
}

function createAccumulator(input: WorkloadEngineBuildInput, professionalId: string): WorkloadAccumulator {
  return {
    tenantId: input.snapshot.tenantId,
    entityId: input.snapshot.entityId,
    professionalId,
    activeCases: 0,
    totalCases: 0,
    closedCases: 0,
    resolutionHours: [],
    firstResponseMinutes: [],
    slaRiskScores: [],
    criticalCases: 0,
    delayedCases: 0,
    waitingResponseCases: 0,
    slaWarningCases: 0,
    slaBreachedCases: 0,
    practiceAreas: {},
    cities: {},
    generatedAt: input.snapshot.builtAt,
  }
}

export function buildProfessionalWorkloadProjections(input: WorkloadEngineBuildInput): ProfessionalWorkloadProjection[] {
  const grouped = new Map<string, WorkloadAccumulator>()

  for (const legalCase of input.cases) {
    const professionalId = normalizeKey(legalCase.assignedProfessionalId)
    if (!professionalId) {
      continue
    }

    const current = grouped.get(professionalId) ?? createAccumulator(input, professionalId)
    const closed = isClosedCase(legalCase)
    const city = normalizeKey(legalCase.city)
    const practiceArea = normalizeKey(legalCase.practiceArea)

    current.totalCases += 1

    if (closed) {
      current.closedCases += 1
      if (isFiniteMetric(legalCase.resolutionHours)) {
        current.resolutionHours.push(legalCase.resolutionHours)
      }
    } else {
      current.activeCases += 1

      const riskScore = getSlaRiskScore(legalCase.slaStatus)
      if (riskScore !== null) {
        current.slaRiskScores.push(riskScore)
      }
      if (legalCase.slaStatus === 'warning') {
        current.slaWarningCases += 1
      }
      if (legalCase.slaStatus === 'breach') {
        current.slaBreachedCases += 1
        current.delayedCases += 1
      }
      if (legalCase.priority === 'critical' || legalCase.severity === 'critical') {
        current.criticalCases += 1
      }
      if (legalCase.waitingFor === 'professional' || legalCase.status === 'waiting') {
        current.waitingResponseCases += 1
      }
      if (practiceArea) {
        current.practiceAreas[practiceArea] = (current.practiceAreas[practiceArea] ?? 0) + 1
      }
      if (city) {
        current.cities[city] = (current.cities[city] ?? 0) + 1
      }
    }

    if (isFiniteMetric(legalCase.firstResponseMinutes)) {
      current.firstResponseMinutes.push(legalCase.firstResponseMinutes)
    }

    grouped.set(professionalId, current)
  }

  return Array.from(grouped.values())
    .map<ProfessionalWorkloadProjection>((current) => ({
      tenantId: current.tenantId,
      entityId: current.entityId,
      professionalId: current.professionalId,
      activeCases: current.activeCases,
      totalCases: current.totalCases,
      closedCases: current.closedCases,
      averageResolutionHours: average(current.resolutionHours),
      averageFirstResponseMinutes: average(current.firstResponseMinutes),
      averageSlaRiskScore: average(current.slaRiskScores),
      criticalCases: current.criticalCases,
      delayedCases: current.delayedCases,
      waitingResponseCases: current.waitingResponseCases,
      slaWarningCases: current.slaWarningCases,
      slaBreachedCases: current.slaBreachedCases,
      practiceAreas: Object.fromEntries(
        Object.entries(current.practiceAreas).sort(([left], [right]) => left.localeCompare(right)),
      ),
      cities: Object.fromEntries(
        Object.entries(current.cities).sort(([left], [right]) => left.localeCompare(right)),
      ),
      workloadLevel: getWorkloadLevel(current.activeCases),
      generatedAt: current.generatedAt,
    }))
    .sort(compareWorkloadProjection)
}

export class WorkloadEngineBuilder {
  build(input: WorkloadEngineBuildInput) {
    return buildProfessionalWorkloadProjections(input)
  }
}

export function createWorkloadEngineBuilder() {
  return new WorkloadEngineBuilder()
}
