import type { MultiEntityRiskLevel } from './multiEntityRegistry.js'

export type EntityCreationBlueprint = {
  targetEntityId: string
  entityType: string
  market: string
  publicFacing: boolean
  identity: {
    name: string
    tagline?: string
  }
  initialGoals: string[]
  allowedActions: string[]
  operatingConstraints?: Record<string, unknown>
  entityInput: {
    brand: Record<string, unknown>
    context: {
      brandCategory?: string
      styleAnswers: Record<string, unknown>
    }
    palette: {
      primary: string
      secondary?: string
      contrast: 'high' | 'medium' | 'low'
    }
    manifestation?: Record<string, unknown>
  }
}

export type EntityCreationProposal = {
  proposalId: string
  sourceEntityId: string
  requestedAt: string
  rationale: string
  blueprint: EntityCreationBlueprint
  riskClassification: MultiEntityRiskLevel
  approvalRequired: boolean
}

export function classifyEntityCreationRisk(blueprint: EntityCreationBlueprint): MultiEntityRiskLevel {
  const hasSensitiveActions = blueprint.allowedActions.some((action) => (
    action === 'dispatch_professional'
      || action === 'modify_pricing'
      || action === 'create_marketplace_case'
      || action === 'publish_public_content'
  ))

  if (blueprint.publicFacing && hasSensitiveActions) {
    return 'critical'
  }

  if (blueprint.publicFacing || hasSensitiveActions) {
    return 'high'
  }

  if (blueprint.allowedActions.includes('respond_to_lead') || blueprint.allowedActions.includes('route_lead')) {
    return 'medium'
  }

  return 'low'
}

export function resolveApprovalRequiredForProposal(blueprint: EntityCreationBlueprint) {
  const riskClassification = classifyEntityCreationRisk(blueprint)
  return riskClassification === 'high' || riskClassification === 'critical' || blueprint.publicFacing
}

export function createEntityCreationProposal(args: {
  proposalId: string
  sourceEntityId: string
  requestedAt: string
  rationale: string
  blueprint: EntityCreationBlueprint
}): EntityCreationProposal {
  return {
    proposalId: args.proposalId,
    sourceEntityId: args.sourceEntityId,
    requestedAt: args.requestedAt,
    rationale: args.rationale,
    blueprint: args.blueprint,
    riskClassification: classifyEntityCreationRisk(args.blueprint),
    approvalRequired: resolveApprovalRequiredForProposal(args.blueprint),
  }
}