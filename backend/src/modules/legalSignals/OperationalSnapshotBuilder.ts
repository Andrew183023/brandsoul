import type {
  OperationalSnapshot,
  OperationalSnapshotBuildInput,
  OperationalSnapshotCaseInput,
  OperationalSnapshotDistribution,
} from './OperationalSnapshot.js'

function isClosedCase(legalCase: OperationalSnapshotCaseInput) {
  return (
    legalCase.status === 'closed'
    || legalCase.status === 'resolved'
  )
}

function normalizeKey(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
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

function countBy(values: Array<string | undefined>): OperationalSnapshotDistribution {
  return values.reduce<OperationalSnapshotDistribution>((distribution, value) => {
    if (!value) {
      return distribution
    }

    distribution[value] = (distribution[value] ?? 0) + 1
    return distribution
  }, {})
}

function isFiniteMetric(value?: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function buildOperationalSnapshot(input: OperationalSnapshotBuildInput): OperationalSnapshot {
  const activeCases = input.cases.filter((legalCase) => !isClosedCase(legalCase))
  const closedCases = input.cases.filter((legalCase) => isClosedCase(legalCase))

  const activeProfessionalIds = new Set(
    activeCases
      .map((legalCase) => normalizeKey(legalCase.assignedProfessionalId))
      .filter((professionalId): professionalId is string => Boolean(professionalId)),
  )

  const resolutionHours = closedCases
    .map((legalCase) => legalCase.resolutionHours)
    .filter(isFiniteMetric)

  const firstResponseMinutes = input.cases
    .map((legalCase) => legalCase.firstResponseMinutes)
    .filter(isFiniteMetric)

  return {
    tenantId: input.tenantId,
    entityId: input.entityId,
    builtAt: input.builtAt,
    openCases: activeCases.length,
    closedCases: closedCases.length,
    backlog: activeCases.length,
    activeProfessionals: activeProfessionalIds.size,
    averageResolutionHours: average(resolutionHours),
    averageFirstResponseMinutes: average(firstResponseMinutes),
    slaWarningCases: activeCases.filter((legalCase) => legalCase.slaStatus === 'warning').length,
    slaBreachedCases: activeCases.filter((legalCase) => legalCase.slaStatus === 'breach').length,
    casesPerProfessional: countBy(activeCases.map((legalCase) => normalizeKey(legalCase.assignedProfessionalId))),
    casesPerPracticeArea: countBy(activeCases.map((legalCase) => normalizeKey(legalCase.practiceArea))),
    casesPerCity: countBy(activeCases.map((legalCase) => normalizeKey(legalCase.city))),
  }
}

export class OperationalSnapshotBuilder {
  build(input: OperationalSnapshotBuildInput) {
    return buildOperationalSnapshot(input)
  }
}

export function createOperationalSnapshotBuilder() {
  return new OperationalSnapshotBuilder()
}
