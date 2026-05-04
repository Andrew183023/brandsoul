import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { FlowMindInput } from '../flowmind/types/flowMindContracts.js'
import type { EntityCognitiveMemory } from '../flowmind/memory/entityCognitiveMemory.js'
import { createBrandSoulToFlowMindAdapter, type BrandSoulAdapterDependencies } from '../flowmind/decision/brandSoulToFlowMindAdapter.js'
import type { FlowMindDecisionAdapter } from '../flowmind/index.js'
import type { FlowMindAdapterLoadStatus } from './flowMindPort.js'

type BrandSoulRuntimeModule = {
  resolveBrandSoulDecision: BrandSoulAdapterDependencies['resolveBrandSoulDecision']
}

type BrandSoulWrapperModule = {
  resolveBrandSoulDecisionWithState: NonNullable<BrandSoulAdapterDependencies['resolveBrandSoulDecisionWithState']>
}

type BrandSoulInitializerModule = {
  initializeBrandSoulCognitiveState: (baseIdentity: unknown) => unknown
}

type BrandSoulStrategyInitializerModule = {
  initializeBrandSoulStrategyProfile: (currentState?: unknown) => unknown
}

type BrandSoulPolicyInitializerModule = {
  initializeBrandSoulPolicyProfile: (strategyProfile?: unknown, currentState?: unknown) => unknown
}

type BrandSoulAdaptiveInitializerModule = {
  initializeBrandSoulAdaptiveDecisionProfile: (strategyProfile?: unknown, policyProfile?: unknown) => unknown
}

type BrandSoulHistoricalModule = {
  initializeBrandSoulHistoricalSignals: (now?: string) => unknown
}

type FlowMindShadowRuntimeContext = {
  entityProfile?: EntityProfile
  now?: string
}

export type BrandSoulShadowAdapterLoadResult = {
  adapter?: FlowMindDecisionAdapter
  status: FlowMindAdapterLoadStatus
  reason?: string
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function readStyleAnswers(entityProfile: EntityProfile) {
  return entityProfile.context?.styleAnswers ?? {}
}

function readExportFormats(entityProfile: EntityProfile) {
  return Array.isArray(entityProfile.export?.formatsEnabled)
    ? entityProfile.export.formatsEnabled
    : []
}

function resolveTone(entityProfile: EntityProfile) {
  const languageStyle = readStyleAnswers(entityProfile).languageStyle
  if (languageStyle === 'technical') {
    return {
      primary: 'consultative',
      modifiers: ['direct'],
    }
  }

  return {
    primary: 'welcoming',
    modifiers: ['warm'],
  }
}

function resolveRelationalStyle(entityProfile: EntityProfile) {
  const actionStyle = readStyleAnswers(entityProfile).actionStyle
  if (actionStyle === 'consultive') {
    return {
      primaryMode: 'advisor',
      connectionIntent: 'clarify-and-guide',
      trustSignals: ['technical-clarity', 'measured-guidance'],
    }
  }

  return {
    primaryMode: 'guide',
    connectionIntent: 'orient-and-support',
    trustSignals: ['consistent-presence'],
  }
}

function resolveCommercialRole(entityProfile: EntityProfile) {
  return readExportFormats(entityProfile).length > 0 ? 'guide' : 'educator'
}

function buildBrandSoulIdentityProfile(entityProfile: EntityProfile) {
  const styleAnswers = readStyleAnswers(entityProfile)
  const identity = entityProfile.finalForm.identity ?? {}
  const publicName = entityProfile.social?.publicName ?? entityProfile.id

  return {
    id: entityProfile.id,
    brandName: publicName,
    essence: identity.manifesto ?? identity.socialLine ?? 'adaptive brand presence',
    tone: resolveTone(entityProfile),
    relationalStyle: resolveRelationalStyle(entityProfile),
    commercialRole: resolveCommercialRole(entityProfile),
    immutableTraits: [
      entityProfile.context?.brandCategory,
      ...(identity.toneKeywords ?? []),
    ].filter((value, index, array) => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index),
    adaptableTraits: [
      {
        trait: styleAnswers.brandStyle,
        adaptationScope: 'contextual',
      },
      {
        trait: styleAnswers.actionStyle,
        adaptationScope: 'contextual',
      },
    ],
    identityRules: [
      {
        key: 'preserve-entity-identity',
        description: 'Maintain recognizable entity identity during orchestration.',
      },
    ],
    guardrails: [
      {
        key: 'no-semantic-drift',
        description: 'Avoid semantic drift during shadow evaluation.',
        severity: 'soft',
      },
    ],
    visualSignature: {
      archetypeHint: identity.archetype,
      bodyMotif: entityProfile.context?.brandCategory,
      coreMotif: identity.name ?? publicName,
      fieldMotif: identity.socialLine ?? 'presence-field',
      motionPrinciples: [entityProfile.behavior?.rhythm?.base ?? 'steady'],
      colorIntent: entityProfile.palette?.primary,
    },
  }
}

function buildBrandSoulState(entityProfile: EntityProfile, now: string) {
  const actionStyle = readStyleAnswers(entityProfile).actionStyle
  const hasExports = readExportFormats(entityProfile).length > 0

  return {
    currentMood: hasExports ? 'focused' : 'curious',
    currentIntent: hasExports ? 'recommend' : 'assist',
    currentFocus: entityProfile.finalForm.identity?.openingLine ?? 'orchestrator-command',
    energyLevel: clamp(entityProfile.behavior?.rhythm?.pulse ?? 0.42),
    interactionMode: actionStyle === 'consultive' ? 'guidance' : 'presentation',
    lastUpdatedAt: now,
  }
}

function buildBrandSoulMemory(entityProfile: EntityProfile) {
  const interactions = entityProfile.relational?.userMemory?.lastInteractions ?? []

  return interactions.slice(-6).map((interaction) => ({
    key: interaction.id,
    value: readString(interaction.summary),
    type: 'relational',
    relevanceScore: clamp(readNumber(interaction.weight) ?? 0),
    createdAt: readString(interaction.occurredAt),
  }))
}

function buildBrandSoulConversation(entityProfile: EntityProfile) {
  const interactions = entityProfile.relational.userMemory.lastInteractions

  return {
    lastMessages: interactions.slice(-4).map((interaction) => ({
      role: 'system',
      content: readString(interaction.summary),
      createdAt: readString(interaction.occurredAt),
    })),
    relevantMemoryKeys: interactions.slice(-4).map((interaction) => interaction.id),
  }
}

function buildBrandSoulCommerceContext() {
  return {
    products: [],
    promotions: [],
    businessHours: [],
    policies: [],
    activeCampaigns: [],
  }
}

function resolveShadowRuntimeContext(input: FlowMindInput): FlowMindShadowRuntimeContext {
  const runtimeRecord = input.context.shadowRuntime
  if (!runtimeRecord || typeof runtimeRecord !== 'object') {
    return {}
  }

  return runtimeRecord as FlowMindShadowRuntimeContext
}

function buildBrandSoulContextFromFlowMind(args: {
  input: FlowMindInput
  memory: EntityCognitiveMemory
}) {
  const runtimeContext = resolveShadowRuntimeContext(args.input)
  const entityProfile = runtimeContext.entityProfile
  const now = runtimeContext.now ?? new Date().toISOString()

  if (!entityProfile) {
    return args.input.context
  }

  return {
    identity: buildBrandSoulIdentityProfile(entityProfile),
    state: buildBrandSoulState(entityProfile, now),
    memory: buildBrandSoulMemory(entityProfile),
    conversation: buildBrandSoulConversation(entityProfile),
    commerce: buildBrandSoulCommerceContext(),
  }
}

function mapBrandSoulResolutionToFlowMindMemory(args: {
  previousMemory: EntityCognitiveMemory
  resolution: {
    nextCognitiveState: Record<string, unknown>
    nextHistoricalSignals: Record<string, unknown>
    nextPolicyProfile: Record<string, unknown>
    nextAdaptiveDecisionProfile: Record<string, unknown>
    nextStrategyProfile: Record<string, unknown>
  }
}) {
  const nextCognitiveState = args.resolution.nextCognitiveState
  const nextStrategyProfile = args.resolution.nextStrategyProfile
  const nextPolicyProfile = args.resolution.nextPolicyProfile
  const nextAdaptiveProfile = args.resolution.nextAdaptiveDecisionProfile
  const nextHistoricalSignals = args.resolution.nextHistoricalSignals

  return {
    cognitiveState: {
      stability: typeof nextCognitiveState.stability === 'number' ? clamp(nextCognitiveState.stability) : args.previousMemory.cognitiveState.stability,
      adaptationMomentum:
        typeof nextCognitiveState.adaptationMomentum === 'number'
          ? clamp(nextCognitiveState.adaptationMomentum)
          : args.previousMemory.cognitiveState.adaptationMomentum,
      engagement:
        typeof nextCognitiveState.engagementLevel === 'number'
          ? clamp(nextCognitiveState.engagementLevel)
          : args.previousMemory.cognitiveState.engagement,
    },
    strategyProfile: {
      dominantStrategy:
        typeof nextStrategyProfile.dominantStrategy === 'string'
          ? nextStrategyProfile.dominantStrategy
          : args.previousMemory.strategyProfile.dominantStrategy,
      adaptationConfidence:
        typeof nextStrategyProfile.adaptationConfidence === 'number'
          ? clamp(nextStrategyProfile.adaptationConfidence)
          : args.previousMemory.strategyProfile.adaptationConfidence,
      strategyBias: {
        supportBias:
          typeof nextStrategyProfile.strategyBias === 'object' && nextStrategyProfile.strategyBias && typeof (nextStrategyProfile.strategyBias as Record<string, unknown>).supportBias === 'number'
            ? clamp((nextStrategyProfile.strategyBias as Record<string, number>).supportBias)
            : args.previousMemory.strategyProfile.strategyBias.supportBias,
        explorationBias:
          typeof nextStrategyProfile.strategyBias === 'object' && nextStrategyProfile.strategyBias && typeof (nextStrategyProfile.strategyBias as Record<string, unknown>).explorationBias === 'number'
            ? clamp((nextStrategyProfile.strategyBias as Record<string, number>).explorationBias)
            : args.previousMemory.strategyProfile.strategyBias.explorationBias,
        conversionBias:
          typeof nextStrategyProfile.strategyBias === 'object' && nextStrategyProfile.strategyBias && typeof (nextStrategyProfile.strategyBias as Record<string, unknown>).conversionBias === 'number'
            ? clamp((nextStrategyProfile.strategyBias as Record<string, number>).conversionBias)
            : args.previousMemory.strategyProfile.strategyBias.conversionBias,
        cautionBias:
          typeof nextStrategyProfile.strategyBias === 'object' && nextStrategyProfile.strategyBias && typeof (nextStrategyProfile.strategyBias as Record<string, unknown>).cautionBias === 'number'
            ? clamp((nextStrategyProfile.strategyBias as Record<string, number>).cautionBias)
            : args.previousMemory.strategyProfile.strategyBias.cautionBias,
      },
    },
    policyProfile: {
      policyMode:
        typeof nextPolicyProfile.policyDrift === 'number' && nextPolicyProfile.policyDrift > 0.2
          ? 'adaptive'
          : typeof nextPolicyProfile.policyStability === 'number' && nextPolicyProfile.policyStability >= 0.82
            ? 'balanced'
            : args.previousMemory.policyProfile.policyMode,
      policyStability:
        typeof nextPolicyProfile.policyStability === 'number'
          ? clamp(nextPolicyProfile.policyStability)
          : args.previousMemory.policyProfile.policyStability,
      policyDrift:
        typeof nextPolicyProfile.policyDrift === 'number'
          ? clamp(nextPolicyProfile.policyDrift)
          : args.previousMemory.policyProfile.policyDrift,
      confidenceAdjustmentProfile: {
        evidenceThreshold:
          typeof nextPolicyProfile.confidenceAdjustmentProfile === 'object' && nextPolicyProfile.confidenceAdjustmentProfile && typeof (nextPolicyProfile.confidenceAdjustmentProfile as Record<string, unknown>).evidenceThreshold === 'number'
            ? Math.max(0, Number((nextPolicyProfile.confidenceAdjustmentProfile as Record<string, number>).evidenceThreshold))
            : args.previousMemory.policyProfile.confidenceAdjustmentProfile.evidenceThreshold,
      },
    },
    adaptiveDecisionProfile: {
      adaptationConfidence:
        typeof nextAdaptiveProfile.adaptationConfidence === 'number'
          ? clamp(nextAdaptiveProfile.adaptationConfidence)
          : args.previousMemory.adaptiveDecisionProfile.adaptationConfidence,
      decisionDrift:
        typeof nextAdaptiveProfile.decisionDrift === 'number'
          ? clamp(nextAdaptiveProfile.decisionDrift)
          : args.previousMemory.adaptiveDecisionProfile.decisionDrift,
      safetyProfile: {
        criticalConfidenceThreshold:
          typeof nextAdaptiveProfile.safetyProfile === 'object' && nextAdaptiveProfile.safetyProfile && typeof (nextAdaptiveProfile.safetyProfile as Record<string, unknown>).criticalConfidenceThreshold === 'number'
            ? clamp((nextAdaptiveProfile.safetyProfile as Record<string, number>).criticalConfidenceThreshold)
            : args.previousMemory.adaptiveDecisionProfile.safetyProfile.criticalConfidenceThreshold,
        minimumEvidence:
          typeof nextAdaptiveProfile.safetyProfile === 'object' && nextAdaptiveProfile.safetyProfile && typeof (nextAdaptiveProfile.safetyProfile as Record<string, unknown>).minimumEvidence === 'number'
            ? Math.max(0, Number((nextAdaptiveProfile.safetyProfile as Record<string, number>).minimumEvidence))
            : args.previousMemory.adaptiveDecisionProfile.safetyProfile.minimumEvidence,
        killSwitchEnabled:
          typeof nextAdaptiveProfile.safetyProfile === 'object' && nextAdaptiveProfile.safetyProfile && typeof (nextAdaptiveProfile.safetyProfile as Record<string, unknown>).killSwitchEnabled === 'boolean'
            ? Boolean((nextAdaptiveProfile.safetyProfile as Record<string, boolean>).killSwitchEnabled)
            : args.previousMemory.adaptiveDecisionProfile.safetyProfile.killSwitchEnabled,
      },
      explorationVsExploitationBalance: {
        explorationBias:
          typeof nextAdaptiveProfile.explorationVsExploitationBalance === 'object' && nextAdaptiveProfile.explorationVsExploitationBalance && typeof (nextAdaptiveProfile.explorationVsExploitationBalance as Record<string, unknown>).explorationBias === 'number'
            ? clamp((nextAdaptiveProfile.explorationVsExploitationBalance as Record<string, number>).explorationBias)
            : args.previousMemory.adaptiveDecisionProfile.explorationVsExploitationBalance.explorationBias,
        exploitationBias:
          typeof nextAdaptiveProfile.explorationVsExploitationBalance === 'object' && nextAdaptiveProfile.explorationVsExploitationBalance && typeof (nextAdaptiveProfile.explorationVsExploitationBalance as Record<string, unknown>).exploitationBias === 'number'
            ? clamp((nextAdaptiveProfile.explorationVsExploitationBalance as Record<string, number>).exploitationBias)
            : args.previousMemory.adaptiveDecisionProfile.explorationVsExploitationBalance.exploitationBias,
      },
    },
    historicalSignals: {
      totalInteractions:
        typeof nextHistoricalSignals.totalInteractions === 'number'
          ? Math.max(0, Number(nextHistoricalSignals.totalInteractions))
          : args.previousMemory.historicalSignals.totalInteractions,
      reliableEvidenceCount:
        typeof nextHistoricalSignals.reliableEvidenceCount === 'number'
          ? Math.max(0, Number(nextHistoricalSignals.reliableEvidenceCount))
          : args.previousMemory.historicalSignals.reliableEvidenceCount,
      rollingSuccessRate:
        typeof nextHistoricalSignals.rollingSuccessRate === 'number'
          ? clamp(nextHistoricalSignals.rollingSuccessRate)
          : args.previousMemory.historicalSignals.rollingSuccessRate,
      rollingContinuationRate:
        typeof nextHistoricalSignals.rollingContinuationRate === 'number'
          ? clamp(nextHistoricalSignals.rollingContinuationRate)
          : args.previousMemory.historicalSignals.rollingContinuationRate,
      rollingEngagementDelta:
        typeof nextHistoricalSignals.rollingEngagementDelta === 'number'
          ? clamp(nextHistoricalSignals.rollingEngagementDelta, -1, 1)
          : args.previousMemory.historicalSignals.rollingEngagementDelta,
    },
  }
}

export async function loadBrandSoulShadowAdapter(): Promise<FlowMindDecisionAdapter | undefined> {
  const result = await loadBrandSoulShadowAdapterResult()
  return result.adapter
}

export async function loadBrandSoulShadowAdapterResult(): Promise<BrandSoulShadowAdapterLoadResult> {
  try {
    const [
      responseModule,
      wrapperModule,
      cognitiveStateModule,
      strategyModule,
      policyModule,
      adaptiveModule,
      historicalModule,
    ] = await Promise.all([
      import(new URL('../../../brandsoul-frontend/src/domain/identity/services/resolveBrandSoulResponse.ts', import.meta.url).href) as Promise<BrandSoulRuntimeModule>,
      import(new URL('../../../brandsoul-frontend/src/domain/identity/services/resolveBrandSoulDecisionWithState.ts', import.meta.url).href) as Promise<BrandSoulWrapperModule>,
      import(new URL('../../../brandsoul-frontend/src/domain/identity/services/initializeBrandSoulCognitiveState.ts', import.meta.url).href) as Promise<BrandSoulInitializerModule>,
      import(new URL('../../../brandsoul-frontend/src/domain/identity/services/initializeBrandSoulStrategyProfile.ts', import.meta.url).href) as Promise<BrandSoulStrategyInitializerModule>,
      import(new URL('../../../brandsoul-frontend/src/domain/identity/services/initializeBrandSoulPolicyProfile.ts', import.meta.url).href) as Promise<BrandSoulPolicyInitializerModule>,
      import(new URL('../../../brandsoul-frontend/src/domain/identity/services/initializeBrandSoulAdaptiveDecisionProfile.ts', import.meta.url).href) as Promise<BrandSoulAdaptiveInitializerModule>,
      import(new URL('../../../brandsoul-frontend/src/domain/identity/services/updateBrandSoulHistoricalSignals.ts', import.meta.url).href) as Promise<BrandSoulHistoricalModule>,
    ])

    return {
      adapter: createBrandSoulToFlowMindAdapter({
      resolveBrandSoulDecision: responseModule.resolveBrandSoulDecision,
      resolveBrandSoulDecisionWithState: wrapperModule.resolveBrandSoulDecisionWithState,
      mapFlowMindContextToBrandSoulContext: buildBrandSoulContextFromFlowMind,
      initializeBrandSoulRuntimeState(args) {
        const context = buildBrandSoulContextFromFlowMind(args)
        if (context === args.input.context) {
          return {
            context,
            currentState: args.memory.cognitiveState,
            currentAdaptiveDecisionProfile: args.memory.adaptiveDecisionProfile,
            currentPolicyProfile: args.memory.policyProfile,
            currentStrategyProfile: args.memory.strategyProfile,
            historicalSignals: args.memory.historicalSignals,
            qualifiedOutcomeHistory: args.input.interaction?.qualifiedOutcomeHistory,
          }
        }

        const identity = (context as Record<string, unknown>).identity
        const identityRecord = asRecord(identity)
        const currentState = cognitiveStateModule.initializeBrandSoulCognitiveState(identityRecord)
        const currentStrategyProfile = strategyModule.initializeBrandSoulStrategyProfile(currentState)
        const currentPolicyProfile = policyModule.initializeBrandSoulPolicyProfile(currentStrategyProfile, currentState)
        const currentAdaptiveDecisionProfile = adaptiveModule.initializeBrandSoulAdaptiveDecisionProfile(currentStrategyProfile, currentPolicyProfile)

        return {
          context,
          currentState,
          currentAdaptiveDecisionProfile,
          currentPolicyProfile,
          currentStrategyProfile,
          historicalSignals: historicalModule.initializeBrandSoulHistoricalSignals(),
          qualifiedOutcomeHistory: args.input.interaction?.qualifiedOutcomeHistory,
        }
      },
      mapBrandSoulResolutionToMemory: mapBrandSoulResolutionToFlowMindMemory,
    }),
      status: 'loaded',
    }
  } catch (error) {
    return {
      status: 'load-failed',
      reason: error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : 'shadow-adapter-load-failed',
    }
  }
}