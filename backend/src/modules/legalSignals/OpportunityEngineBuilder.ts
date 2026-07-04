import type {
  OperationalOpportunity,
  OperationalOpportunityAffectedEntity,
  OperationalOpportunitySeverity,
  OpportunityEngineBuildInput,
  OpportunityEngineThresholds,
} from './OpportunityEngine.js'

const DEFAULT_THRESHOLDS: OpportunityEngineThresholds = {
  cityGrowthBacklog: 10,
  specialtyGrowthBacklog: 8,
  officeBacklog: 25,
  highDemandTotalCases: 20,
  capacityImbalanceActiveCases: 8,
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function assertValidThreshold(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid threshold "${name}". Expected a finite number >= 0.`)
  }
}

function resolveThresholds(overrides?: Partial<OpportunityEngineThresholds>): OpportunityEngineThresholds {
  const resolved: OpportunityEngineThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(overrides ?? {}),
  }

  for (const [name, value] of Object.entries(resolved) as Array<[keyof OpportunityEngineThresholds, number]>) {
    assertValidThreshold(name, value)
  }

  return resolved
}

function compareOpportunity(left: OperationalOpportunity, right: OperationalOpportunity) {
  if (left.generatedAt !== right.generatedAt) {
    return left.generatedAt.localeCompare(right.generatedAt)
  }

  if (left.type !== right.type) {
    return left.type.localeCompare(right.type)
  }

  return left.id.localeCompare(right.id)
}

function buildOpportunityId(args: {
  tenantId: number
  entityId: string
  type: OperationalOpportunity['type']
  affectedEntity: OperationalOpportunityAffectedEntity
  generatedAt: string
}) {
  return [
    args.tenantId,
    args.entityId,
    args.type,
    args.affectedEntity.kind,
    args.affectedEntity.id,
    args.generatedAt,
  ].join(':')
}

function deriveSeverity(score: number): OperationalOpportunitySeverity {
  if (score >= 90) {
    return 'critical'
  }
  if (score >= 75) {
    return 'high'
  }
  if (score >= 50) {
    return 'medium'
  }
  return 'low'
}

function createOpportunity(args: Omit<OperationalOpportunity, 'id' | 'severity'> & { score: number }) {
  const score = clampScore(args.score)
  const severity = deriveSeverity(score)

  return {
    ...args,
    id: buildOpportunityId({
      tenantId: args.tenantId,
      entityId: args.entityId,
      type: args.type,
      affectedEntity: args.affectedEntity,
      generatedAt: args.generatedAt,
    }),
    severity,
    score,
  }
}

export function buildOperationalOpportunities(input: OpportunityEngineBuildInput): OperationalOpportunity[] {
  const thresholds = resolveThresholds(input.thresholds)
  const opportunities: OperationalOpportunity[] = []
  const generatedAt = input.snapshot.builtAt
  const { tenantId, entityId } = input.snapshot

  for (const regional of input.regional) {
    if (regional.backlog >= thresholds.cityGrowthBacklog) {
      opportunities.push(createOpportunity({
        tenantId,
        entityId,
        type: 'CITY_GROWTH',
        title: 'Cidade com oportunidade de expansão operacional',
        description: `A cidade ${regional.city} atingiu backlog regional de ${regional.backlog} caso(s).`,
        affectedEntity: { kind: 'city', id: regional.city },
        evidence: {
          backlog: regional.backlog,
          threshold: thresholds.cityGrowthBacklog,
          openCases: regional.openCases,
        },
        score: 50 + ((regional.backlog - thresholds.cityGrowthBacklog) * 5),
        generatedAt,
      }))
    }

    if (regional.openCases > 0 && regional.activeProfessionals === 0) {
      opportunities.push(createOpportunity({
        tenantId,
        entityId,
        type: 'LOW_COVERAGE',
        title: 'Cobertura operacional insuficiente',
        description: `A cidade ${regional.city} possui casos ativos sem profissionais ativos alocados.`,
        affectedEntity: { kind: 'city', id: regional.city },
        evidence: {
          openCases: regional.openCases,
          activeProfessionals: regional.activeProfessionals,
        },
        score: 80 + (regional.openCases * 2),
        generatedAt,
      }))
    }

    if (regional.totalCases >= thresholds.highDemandTotalCases) {
      opportunities.push(createOpportunity({
        tenantId,
        entityId,
        type: 'HIGH_DEMAND',
        title: 'Alta demanda regional identificada',
        description: `A cidade ${regional.city} alcançou ${regional.totalCases} caso(s) totais.`,
        affectedEntity: { kind: 'city', id: regional.city },
        evidence: {
          totalCases: regional.totalCases,
          threshold: thresholds.highDemandTotalCases,
        },
        score: 50 + ((regional.totalCases - thresholds.highDemandTotalCases) * 3),
        generatedAt,
      }))
    }
  }

  for (const specialty of input.specialties) {
    if (specialty.backlog >= thresholds.specialtyGrowthBacklog) {
      opportunities.push(createOpportunity({
        tenantId,
        entityId,
        type: 'SPECIALTY_GROWTH',
        title: 'Especialidade com potencial de crescimento',
        description: `A especialidade ${specialty.practiceArea} atingiu backlog de ${specialty.backlog} caso(s).`,
        affectedEntity: { kind: 'practice_area', id: specialty.practiceArea },
        evidence: {
          backlog: specialty.backlog,
          threshold: thresholds.specialtyGrowthBacklog,
          openCases: specialty.openCases,
        },
        score: 50 + ((specialty.backlog - thresholds.specialtyGrowthBacklog) * 5),
        generatedAt,
      }))
    }
  }

  if (input.snapshot.backlog >= thresholds.officeBacklog) {
    opportunities.push(createOpportunity({
      tenantId,
      entityId,
      type: 'HIGH_BACKLOG',
      title: 'Backlog operacional elevado',
      description: `O escritório atingiu backlog operacional de ${input.snapshot.backlog} caso(s) ativos.`,
      affectedEntity: { kind: 'office', id: entityId },
      evidence: {
        backlog: input.snapshot.backlog,
        threshold: thresholds.officeBacklog,
      },
      score: 55 + ((input.snapshot.backlog - thresholds.officeBacklog) * 2),
      generatedAt,
    }))
  }

  for (const workload of input.workloads) {
    if (workload.workloadLevel === 'overloaded') {
      opportunities.push(createOpportunity({
        tenantId,
        entityId,
        type: 'PROFESSIONAL_OVERLOAD',
        title: 'Profissional sobrecarregado',
        description: `O profissional ${workload.professionalId} está com carga operacional acima do limite saudável.`,
        affectedEntity: { kind: 'professional', id: workload.professionalId },
        evidence: {
          activeCases: workload.activeCases,
          workloadLevel: workload.workloadLevel,
        },
        score: 80 + ((workload.activeCases - 18) * 2),
        generatedAt,
      }))
    }

    if (workload.averageSlaRiskScore !== null && workload.averageSlaRiskScore >= 70) {
      opportunities.push(createOpportunity({
        tenantId,
        entityId,
        type: 'HIGH_SLA_RISK',
        title: 'Risco elevado de SLA',
        description: `O profissional ${workload.professionalId} apresenta risco médio de SLA acima do patamar esperado.`,
        affectedEntity: { kind: 'professional', id: workload.professionalId },
        evidence: {
          averageSlaRiskScore: workload.averageSlaRiskScore,
          delayedCases: workload.delayedCases,
          slaBreachedCases: workload.slaBreachedCases,
        },
        score: workload.averageSlaRiskScore,
        generatedAt,
      }))
    }
  }

  if (input.workloads.length > 1) {
    const activeCaseCounts = input.workloads.map((workload) => workload.activeCases)
    const busiest = Math.max(...activeCaseCounts)
    const leastBusy = Math.min(...activeCaseCounts)
    const difference = busiest - leastBusy

    if (difference >= thresholds.capacityImbalanceActiveCases) {
      opportunities.push(createOpportunity({
        tenantId,
        entityId,
        type: 'CAPACITY_IMBALANCE',
        title: 'Desequilíbrio de capacidade operacional',
        description: `A diferença entre a maior e a menor carga ativa da equipe chegou a ${difference} caso(s).`,
        affectedEntity: { kind: 'office', id: entityId },
        evidence: {
          busiestActiveCases: busiest,
          leastBusyActiveCases: leastBusy,
          difference,
          threshold: thresholds.capacityImbalanceActiveCases,
        },
        score: 55 + ((difference - thresholds.capacityImbalanceActiveCases) * 4),
        generatedAt,
      }))
    }
  }

  return opportunities.sort(compareOpportunity)
}

export class OpportunityEngineBuilder {
  build(input: OpportunityEngineBuildInput) {
    return buildOperationalOpportunities(input)
  }
}

export function createOpportunityEngineBuilder() {
  return new OpportunityEngineBuilder()
}
