import type { OpportunitySnapshot } from '../runtime/opportunitySnapshotStore.js'
import type { OpportunityExecutionProposal } from './contracts/OpportunityExecutionProposal.js'

const MINIMUM_CONFIDENCE = 0.7
const MINIMUM_ECONOMIC_RELEVANCE = 70

function normalizeIdentifierPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildProposalId(args: {
  sourceOpportunityId: string
  entityId: string
  actionType: string
}) {
  return `opportunity-proposal:${normalizeIdentifierPart(args.sourceOpportunityId)}:${normalizeIdentifierPart(args.entityId)}:${normalizeIdentifierPart(args.actionType)}`
}

function buildProposalDeduplicationKey(args: {
  sourceOpportunityId: string
  entityId: string
  actionType: string
}) {
  return `${args.sourceOpportunityId}::${args.entityId}::${args.actionType}`
}

function extractKeywordFromReasoning(reasoning: string) {
  const keywordMatch = reasoning.match(/signal "([^"]+)"/i)
  return keywordMatch?.[1]?.trim().toLowerCase() ?? null
}

function resolveActionType(category: string) {
  switch (category) {
    case 'legal':
      return 'portfolio.lead.route'
    case 'real_estate':
      return 'property.lead.capture'
    case 'logistics':
      return 'freight.inquiry.start'
    case 'finance':
      return 'investment.outreach.start'
    default:
      return null
  }
}

function isHighConfidenceCandidate(args: {
  confidence: number
  economicRelevance: number
  leadProbability: string
}) {
  return args.confidence >= MINIMUM_CONFIDENCE
    && args.economicRelevance >= MINIMUM_ECONOMIC_RELEVANCE
    && args.leadProbability === 'high'
}

export function buildOpportunityExecutionProposals(
  snapshot: OpportunitySnapshot,
  existingProposals: OpportunityExecutionProposal[] = [],
): OpportunityExecutionProposal[] {
  if (snapshot.status !== 'ready') {
    return []
  }

  const existingKeys = new Set(
    existingProposals.map((proposal) => buildProposalDeduplicationKey({
      sourceOpportunityId: proposal.sourceOpportunityId,
      entityId: proposal.entityId,
      actionType: proposal.actionType,
    })),
  )
  const emittedKeys = new Set<string>()

  return snapshot.suggestions.flatMap((suggestion) => {
    const keyword = extractKeywordFromReasoning(suggestion.reasoning)
    if (!keyword) {
      return []
    }

    const opportunity = snapshot.opportunities.find((candidate) => candidate.keyword.trim().toLowerCase() === keyword)
    if (!opportunity) {
      return []
    }

    if (!isHighConfidenceCandidate({
      confidence: suggestion.confidence,
      economicRelevance: opportunity.economicRelevance,
      leadProbability: opportunity.leadProbability,
    })) {
      return []
    }

    const actionType = resolveActionType(opportunity.category)
    if (!actionType) {
      return []
    }

    const dedupeKey = buildProposalDeduplicationKey({
      sourceOpportunityId: opportunity.id,
      entityId: suggestion.entityId,
      actionType,
    })

    if (existingKeys.has(dedupeKey) || emittedKeys.has(dedupeKey)) {
      return []
    }

    emittedKeys.add(dedupeKey)

    const proposal: OpportunityExecutionProposal = {
      proposalId: buildProposalId({
        sourceOpportunityId: opportunity.id,
        entityId: suggestion.entityId,
        actionType,
      }),
      sourceOpportunityId: opportunity.id,
      entityId: suggestion.entityId,
      entityName: suggestion.entityName,
      actionType,
      confidence: suggestion.confidence,
      reasoning: `${suggestion.reasoning} Economic relevance ${opportunity.economicRelevance}; lead probability ${opportunity.leadProbability}.`,
      createdAt: snapshot.generatedAt,
      governanceStatus: 'pending',
    }

    return [proposal]
  })
}
