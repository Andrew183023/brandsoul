import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import {
  resolvePublicEntityInteraction,
  resolvePublicEntityInteractionAvailability,
} from './publicEntityInteractionService.js'

test('resolvePublicEntityInteraction builds a render-ready backend decision response', async () => {
  const entity = createTestEntity()

  const result = await resolvePublicEntityInteraction({
    entityId: entity.id,
    entityProfile: entity,
    requestId: 'interaction-1',
    userMessage: 'Quero entender melhor essa presença pública',
    currentRelationshipLabel: 'curioso recorrente',
    currentPresenceIntensity: 0.58,
    allowDebug: true,
    flowMindService: {
      mode: 'shadow',
      async evaluateOrchestratorCommand() {
        return {
          mode: 'shadow',
          summary: {
            mode: 'shadow',
            adapterName: 'shadow-test-adapter',
            adapterLoadStatus: 'loaded',
            invokedAt: '2026-04-20T10:00:00.000Z',
            decisionSource: 'adaptive-core',
            terminalAuthority: 'adaptive-core',
            semanticFrozen: true,
            lowRiskLaneUsed: false,
            fallbackConditions: [],
            fallbackUsed: false,
            decision: {
              intent: 'assist',
              action: 'support',
              confidence: 0.77,
            },
            objectiveType: 'engage',
          },
          output: {
            decision: {
              intent: 'assist',
              action: 'support',
              confidence: 0.77,
              decisionHash: '',
              responsePlan: {
                kind: 'support',
                topic: 'presenca publica',
                requiredData: ['clareza de contexto'],
                optionalCloseStyle: 'contextual-clarity',
              },
              actionPayload: {},
              memoryReadSet: [],
              memoryWritePlan: [],
              expectedStateChanges: [],
            },
            decisionSource: 'adaptive-core',
            terminalAuthority: 'adaptive-core',
            semanticFrozen: true,
            lowRiskLaneUsed: false,
            fallbackConditions: [],
            updatedMemory: {} as never,
            updatedProfiles: {} as never,
          },
        }
      },
    },
  })

  assert.ok(result)
  assert.equal(result.status, 'ready')
  assert.equal(result.entityId, entity.id)
  assert.equal(result.requestId, 'interaction-1')
  assert.equal(result.decision.decision.intent, 'assist')
  assert.equal(result.decision.decision.action, 'support')
  assert.equal(result.decision.terminalAuthority, 'adaptive-core')
  assert.equal(result.fallback.occurred, false)
  assert.equal(result.fallback.source, 'backend-authoritative')
  assert.equal(result.decision.updatedPresenceIndicators?.relationshipLabel, 'curioso recorrente')
  assert.ok(result.decision.visualPatch?.runtimePatch)
  assert.equal(result.decision.debugSummary?.fallbackUsed, false)
})

test('resolvePublicEntityInteractionAvailability detects explicit kill switch', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      ...entity.runtime?.flowMind,
      killSwitchEnabled: true,
    },
  }

  const availability = resolvePublicEntityInteractionAvailability({
    entityProfile: entity,
    flowMindService: {
      mode: 'shadow',
      async evaluateOrchestratorCommand() {
        return undefined
      },
    },
  })

  assert.equal(availability.enabled, false)
  assert.equal(availability.reason, 'entity-kill-switch-enabled')
})

test('resolvePublicEntityInteraction prefers backend-native identity and transformation defaults', async () => {
  const entity = createTestEntity()
  entity.canonicalIdentity = {
    identity: {
      entityId: entity.id,
      entityType: 'services',
      canonicalName: 'Aurora Canonical',
      canonicalSlug: 'aurora-canonical-seed',
      identityVersion: 1,
      genesisFingerprint: 'fingerprint-aurora-canonical',
    },
    spark: {
      sparkTone: 'luminous',
      sparkPower: 'support',
      sparkArchetype: 'signal',
      sparkState: 'guided',
      sparkLifecycleState: 'active',
    },
    persona: {
      businessDescription: 'Presenca backend-native.',
      personalityTraits: ['editorial'],
      communicationStyle: 'steady',
      escalationStyle: 'guided_resolution',
      responseBehaviorProfile: {
        primaryObjective: 'engage',
        riskTolerance: 'medium',
        channelMode: 'public',
      },
    },
    transformation: {
      auraProfile: 'signal',
      visualStateDefaults: {
        tone: 'luminous',
        intensity: 0.81,
        confidence: 0.66,
      },
      transformationMode: 'signal',
      interactionEnergyProfile: {
        baseline: 0.6,
        supportBias: -0.05,
        guideBias: 0.03,
        sellBias: 0.08,
        refuseBias: -0.08,
      },
    },
    runtime: {
      runtimeIdentityVersion: 1,
      runtimeBindingVersion: 1,
      governanceProfile: {
        replaySafe: true,
        mutationAuthority: 'sovereign-backend',
        evidenceMode: 'append-only',
      },
      memoryProfile: {
        scope: 'entity',
        persistence: 'backend-native',
        isolation: 'tenant-scoped',
      },
    },
  }

  const result = await resolvePublicEntityInteraction({
    entityId: entity.id,
    entityProfile: entity,
    requestId: 'interaction-2',
    userMessage: 'Quero falar com essa entidade',
    flowMindService: {
      mode: 'shadow',
      async evaluateOrchestratorCommand() {
        return {
          mode: 'shadow',
          summary: {
            mode: 'shadow',
            adapterName: 'shadow-test-adapter',
            adapterLoadStatus: 'loaded',
            invokedAt: '2026-04-20T10:00:00.000Z',
            decisionSource: 'adaptive-core',
            terminalAuthority: 'adaptive-core',
            semanticFrozen: true,
            lowRiskLaneUsed: false,
            fallbackConditions: [],
            fallbackUsed: false,
            decision: {
              intent: 'assist',
              action: 'support',
              confidence: 0.77,
            },
            objectiveType: 'engage',
          },
          output: {
            decision: {
              intent: 'assist',
              action: 'support',
              confidence: 0.77,
              decisionHash: '',
              responsePlan: {
                kind: 'support',
                topic: 'presenca publica',
                requiredData: ['clareza de contexto'],
                optionalCloseStyle: 'contextual-clarity',
              },
              actionPayload: {},
              memoryReadSet: [],
              memoryWritePlan: [],
              expectedStateChanges: [],
            },
            decisionSource: 'adaptive-core',
            terminalAuthority: 'adaptive-core',
            semanticFrozen: true,
            lowRiskLaneUsed: false,
            fallbackConditions: [],
            updatedMemory: {} as never,
            updatedProfiles: {} as never,
          },
        }
      },
    },
  })

  assert.ok(result)
  assert.match(result.decision.responseText, /Aurora Canonical/)
  assert.equal(result.decision.visualPatch?.visualState?.tone, 'luminous')
  assert.equal(result.decision.visualPatch?.visualState?.intensity, 0.79)
})
