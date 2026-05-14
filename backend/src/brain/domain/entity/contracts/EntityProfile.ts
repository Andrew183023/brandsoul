import type { EntityInput } from './EntityInput.js'
import type { EntityExportProfile } from './EntityExportProfile.js'
import type { EntitySocialProfile } from './EntitySocialProfile.js'
import type { EntityMorphology } from './EntityMorphology.js'
import type { EntityBehavior } from './EntityBehavior.js'
import type { EntityFinalForm } from './EntityFinalForm.js'
import type { EntityBindingState } from './EntityBindingState.js'
import type { EntityAccumulatedValue } from './EntityAccumulatedValue.js'
import type { EntityTimelineLog } from './EntityTimelineLog.js'
import type { BehaviorState } from './BehaviorState.js'
import type { HookLoop } from './HookLoop.js'
import type { IdentityImprint } from './IdentityImprint.js'
import type { ProgressionState } from './ProgressionState.js'
import type { UserMemory } from './UserMemory.js'
import type { EntityManifestation } from '../../manifestation/contracts/EntityManifestation.js'
import type { RuntimeControl } from '../../orchestration/contracts/RuntimeControl.js'
import type { RenderOutput } from '../../rendering/contracts/RenderOutput.js'
import type { EntityBusinessConfig } from '../../../../domain/entityBusinessConfig.js'

export type CanonicalEntityType =
  | 'brand'
  | 'store'
  | 'services'
  | 'legal'
  | 'professional'
  | 'institutional'

export type CanonicalSparkState = 'stable' | 'focused' | 'guided' | 'expansive' | 'protected'
export type CanonicalSparkLifecycleState = 'genesis' | 'initialized' | 'active' | 'evolving'

export type CanonicalResponseBehaviorProfile = {
  primaryObjective: 'engage' | 'educate' | 'support' | 'guide' | 'convert'
  riskTolerance: 'low' | 'medium' | 'high'
  channelMode: 'public' | 'hybrid' | 'private'
}

export type CanonicalVisualStateDefaults = {
  tone: string
  intensity: number
  confidence: number
}

export type CanonicalInteractionEnergyProfile = {
  baseline: number
  supportBias: number
  guideBias: number
  sellBias: number
  refuseBias: number
}

export type CanonicalEntityIdentity = {
  identity: {
    entityId: string
    entityType: CanonicalEntityType
    canonicalName: string
    canonicalSlug: string
    identityVersion: number
    genesisFingerprint: string
  }
  spark: {
    sparkTone: string
    sparkPower: string
    sparkArchetype: string
    sparkState: CanonicalSparkState
    sparkLifecycleState: CanonicalSparkLifecycleState
  }
  persona: {
    businessDescription?: string
    personalityTraits: string[]
    communicationStyle: string
    escalationStyle: string
    responseBehaviorProfile: CanonicalResponseBehaviorProfile
  }
  transformation: {
    auraProfile: string
    visualStateDefaults: CanonicalVisualStateDefaults
    transformationMode: string
    interactionEnergyProfile: CanonicalInteractionEnergyProfile
  }
  runtime: {
    runtimeIdentityVersion: number
    runtimeBindingVersion: number
    governanceProfile: {
      replaySafe: boolean
      mutationAuthority: 'sovereign-backend'
      evidenceMode: 'append-only'
    }
    memoryProfile: {
      scope: 'entity'
      persistence: 'backend-native'
      isolation: 'tenant-scoped'
    }
  }
}

export type EntityProfile = {
  id: string
  ownerId?: string
  schemaVersion: 1
  source: 'frontend-local' | 'backend-engine' | 'hybrid'
  brand: EntityInput['brand']
  context: EntityInput['context']
  palette: EntityInput['palette']
  social: EntitySocialProfile
  export: EntityExportProfile
  manifestation: EntityManifestation
  morphology: EntityMorphology
  behavior: EntityBehavior
  relational: {
    behaviorState: BehaviorState
    progression: ProgressionState
    userMemory: UserMemory
    hookLoop: HookLoop
    binding: EntityBindingState
    imprint: IdentityImprint
    timelineLog: EntityTimelineLog
    value: EntityAccumulatedValue
  }
  finalForm: EntityFinalForm
  canonicalIdentity?: CanonicalEntityIdentity
  runtime?: {
    control?: RuntimeControl
    renderOutput?: RenderOutput
    flowMind?: {
      mode?: 'disabled' | 'shadow' | 'dry-run' | 'debug' | 'active'
      killSwitchEnabled?: boolean
      publicPartial?: {
        rolloutPercentage?: number
        latencyBudgetMs?: number
        criticalDivergenceThreshold?: number
        killSwitchEnabled?: boolean
        automationMode?: 'recommendation-only' | 'auto-apply'
        alertWebhook?: {
          enabled?: boolean
          url?: string
          timeoutMs?: number
          retryCount?: number
        }
        autoRolloutPolicy?: {
          lastEvaluationAt?: string
          cooldownUntil?: string
          incidentState?: {
            state: 'normal' | 'watch' | 'degraded' | 'critical' | 'stale' | 'absent'
            enteredAt: string
            updatedAt: string
          }
          operationalAlertState?: Record<string, {
            fingerprint: string
            severity: 'warning' | 'critical'
            active: boolean
            lastObservedAt: string
            lastEmittedAt?: string
            lastResolvedAt?: string
          }>
          lastRecommendation?: {
            action: 'increase' | 'maintain' | 'reduce' | 'rollback'
            status: 'recommended' | 'blocked' | 'applied'
            currentRolloutPercentage: number
            targetRolloutPercentage: number
            stepPercentage: number
            sampleSize: number
            minSampleSize: number
            minimumWindowMinutes: number
            windowStartAt?: string
            windowEndAt?: string
            summary: string
            reasons: string[]
            blockedReason?: string
            hysteresisActive: boolean
            rollbackArmed: boolean
            evaluatedAt: string
          }
          lastAdjustment?: {
            action: 'increase' | 'reduce' | 'rollback' | 'manual-update'
            source: 'manual' | 'policy-auto-apply'
            fromRolloutPercentage: number
            toRolloutPercentage: number
            reason: string
            changedAt: string
          }
        }
        updatedAt?: string
      }
      updatedAt?: string
    }
  }
  metadata: {
    createdAt: string
    updatedAt?: string
    requestId?: string
    sessionId?: string
    confidence?: number
    businessConfig?: EntityBusinessConfig
    notes?: string[]
  }
}
