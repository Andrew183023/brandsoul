import type {
  ExecutiveDashboard,
  ExecutiveDashboardBuildInput,
} from './ExecutiveDashboardTypes.js'

export function mapExecutiveDashboard(
  input: ExecutiveDashboardBuildInput,
): ExecutiveDashboard {
  if (!input.officeHealth) {
    throw new Error('Executive dashboard mapper requires officeHealth.')
  }
  if (!input.decisionCenter) {
    throw new Error('Executive dashboard mapper requires decisionCenter.')
  }
  if (!input.morningBrief) {
    throw new Error('Executive dashboard mapper requires morningBrief.')
  }
  if (!input.executiveFeed) {
    throw new Error('Executive dashboard mapper requires executiveFeed.')
  }

  return {
    generatedAt: input.generatedAt ?? input.growth.generatedAt,
    officeState: {
      officeId: input.growth.officeId,
      tenantId: input.growth.tenantId,
      growthStatus: input.growth.status,
      operationalStatus: input.operational.status,
    },
    morningBrief: input.morningBrief,
    officeHealth: input.officeHealth,
    decisionCenter: input.decisionCenter,
    executiveFeed: input.executiveFeed,
    growth: input.growth,
    operational: input.operational,
  }
}
