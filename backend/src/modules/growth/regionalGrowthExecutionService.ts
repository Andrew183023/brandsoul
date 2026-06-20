import type { RegionalGrowthRepository } from './regionalGrowthRepository.js'
import type { RegionalSignalsRepository } from './regionalSignalsRepository.js'

export type ExecuteGrowthRecommendationParams = {
  tenantId: string
  entityId: string
  signalId: string
}

export class GrowthRecommendationExecutionError extends Error {
  constructor(
    readonly code: 'GROWTH_SIGNAL_NOT_FOUND' | 'GROWTH_DERIVED_CAMPAIGN_CREATE_FAILED' | 'GROWTH_DERIVED_TARGET_CREATE_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'GrowthRecommendationExecutionError'
  }
}

export async function executeGrowthRecommendation(
  growthRepository: RegionalGrowthRepository,
  signalsRepository: RegionalSignalsRepository,
  params: ExecuteGrowthRecommendationParams,
) {
  const signal = await signalsRepository.getSignalById(params.tenantId, params.entityId, params.signalId)

  if (!signal) {
    throw new GrowthRecommendationExecutionError(
      'GROWTH_SIGNAL_NOT_FOUND',
      `Signal "${params.signalId}" was not found for entity "${params.entityId}".`,
    )
  }

  const campaign = await growthRepository.createCampaign({
    tenantId: params.tenantId,
    entityId: params.entityId,
    campaignName: `Campanha derivada — ${signal.city} / ${signal.specialty}`,
    states: [],
    cities: [signal.city],
    radiusKm: signal.bestRecommendedRadiusKm ?? 30,
    specialties: [signal.specialty],
    objective: 'lead_capture',
  })

  if (!campaign) {
    throw new GrowthRecommendationExecutionError(
      'GROWTH_DERIVED_CAMPAIGN_CREATE_FAILED',
      `Unable to create derived campaign for signal "${params.signalId}".`,
    )
  }

  const target = await growthRepository.createCampaignTarget(params.tenantId, {
    campaignId: campaign.id,
    channel: signal.bestChannel === 'google_search'
      || signal.bestChannel === 'google_local'
      || signal.bestChannel === 'facebook'
      || signal.bestChannel === 'instagram'
      ? signal.bestChannel
      : 'google_search',
    audienceName: signal.bestAudienceName ?? `Público ${signal.specialty}`,
    audienceDescription: 'Criado automaticamente a partir de recomendação Growth.',
    intentStage: signal.bestIntentStage === 'awareness'
      || signal.bestIntentStage === 'consideration'
      || signal.bestIntentStage === 'decision'
      ? signal.bestIntentStage
      : 'consideration',
    searchIntent: signal.bestSearchIntent === 'problem_aware'
      || signal.bestSearchIntent === 'solution_aware'
      || signal.bestSearchIntent === 'provider_aware'
      || signal.bestSearchIntent === 'ready_to_hire'
      ? signal.bestSearchIntent
      : 'provider_aware',
    recommendedRadiusKm: signal.bestRecommendedRadiusKm ?? 30,
  })

  if (!target) {
    throw new GrowthRecommendationExecutionError(
      'GROWTH_DERIVED_TARGET_CREATE_FAILED',
      `Unable to create derived target for signal "${params.signalId}".`,
    )
  }

  return {
    campaign,
    target,
  }
}
