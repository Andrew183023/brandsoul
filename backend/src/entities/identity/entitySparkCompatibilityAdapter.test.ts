import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from '../../brain/flowmind/testUtils.js'
import {
  applyLegacySparkPayloadToEntityProfile,
  mapEntityProfileToLegacySparkPayload,
} from './entitySparkCompatibilityAdapter.js'

test('legacy spark payload maps into backend-native canonical identity', () => {
  const entity = createTestEntity()
  const mapped = applyLegacySparkPayloadToEntityProfile({
    entityProfile: entity,
    tenantId: 11,
    createdAt: '2026-05-10T12:00:00.000Z',
    payload: {
      brandName: 'Centelha Juridica',
      tone: 'serio',
      power: 'guidance',
      businessModel: 'professional',
      brandType: 'professional',
      voiceStyle: 'technical',
      businessDescription: 'Orientacao juridica inicial com postura institucional.',
      brandHighlight: 'Clareza institucional imediata.',
    },
  })

  assert.equal(mapped.canonicalIdentity?.identity.canonicalName, 'Centelha Juridica')
  assert.equal(mapped.canonicalIdentity?.identity.entityType, 'professional')
  assert.equal(mapped.canonicalIdentity?.spark.sparkTone, 'serio')
  assert.equal(mapped.canonicalIdentity?.spark.sparkPower, 'guidance')
  assert.equal(mapped.canonicalIdentity?.persona.communicationStyle, 'technical')
  assert.equal(mapped.canonicalIdentity?.persona.businessDescription, 'Orientacao juridica inicial com postura institucional.')
})

test('backend canonical identity maps back into legacy spark compatibility payload', () => {
  const entity = createTestEntity()
  entity.canonicalIdentity = {
    identity: {
      entityId: 'entity-aurora',
      entityType: 'services',
      canonicalName: 'Aurora Assist',
      canonicalSlug: 'aurora-assist-seed',
      identityVersion: 2,
      genesisFingerprint: 'fingerprint-aurora',
    },
    spark: {
      sparkTone: 'calmo',
      sparkPower: 'support',
      sparkArchetype: 'signal',
      sparkState: 'guided',
      sparkLifecycleState: 'active',
    },
    persona: {
      businessDescription: 'Atendimento consultivo com clareza.',
      personalityTraits: ['editorial', 'calm'],
      communicationStyle: 'balanced',
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
        tone: 'stable',
        intensity: 0.6,
        confidence: 0.7,
      },
      transformationMode: 'aurora',
      interactionEnergyProfile: {
        baseline: 0.5,
        supportBias: -0.05,
        guideBias: 0.03,
        sellBias: 0.08,
        refuseBias: -0.08,
      },
    },
    runtime: {
      runtimeIdentityVersion: 2,
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

  const payload = mapEntityProfileToLegacySparkPayload(entity)

  assert.equal(payload.brandName, 'Aurora Assist')
  assert.equal(payload.tone, 'calmo')
  assert.equal(payload.power, 'support')
  assert.equal(payload.businessModel, 'service')
  assert.equal(payload.voiceStyle, 'balanced')
  assert.equal(payload.businessDescription, 'Atendimento consultivo com clareza.')
})

