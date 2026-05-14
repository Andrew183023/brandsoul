import assert from 'node:assert/strict'
import test from 'node:test'

import { createOrchestratorCommand } from '../../orchestrator/orchestratorCore.js'
import { createTestEntity } from '../../brain/flowmind/testUtils.js'
import { resolveObjectiveFromEntityProfile } from '../../services/flowMindService.js'
import {
  bumpCanonicalIdentityVersion,
  ensureCanonicalEntityIdentity,
} from './entityIdentityBuilder.js'

test('EntityProfile becomes the canonical authority for backend-native identity fields', () => {
  const entity = createTestEntity()
  const canonical = ensureCanonicalEntityIdentity(entity, {
    tenantId: 3,
    createdAt: '2026-05-10T12:00:00.000Z',
  })

  assert.ok(canonical.canonicalIdentity)
  assert.equal(canonical.id, canonical.canonicalIdentity.identity.entityId)
  assert.equal(canonical.social.publicName, canonical.canonicalIdentity.identity.canonicalName)
  assert.equal(canonical.finalForm.identity?.name, canonical.canonicalIdentity.identity.canonicalName)
  assert.equal(canonical.canonicalIdentity.runtime.governanceProfile.replaySafe, true)
  assert.equal(canonical.canonicalIdentity.runtime.memoryProfile.persistence, 'backend-native')
})

test('identityVersion increments when canonical identity changes', () => {
  const entity = createTestEntity()
  const bumped = bumpCanonicalIdentityVersion(entity)

  assert.equal(entity.canonicalIdentity?.identity.identityVersion, 1)
  assert.equal(bumped.canonicalIdentity?.identity.identityVersion, 2)
  assert.equal(bumped.canonicalIdentity?.runtime.runtimeIdentityVersion, 2)
})

test('replay-safe identity reconstruction produces the same canonical identity for the same entity input', () => {
  const entity = createTestEntity()
  const createdAt = '2026-05-10T12:00:00.000Z'

  const first = ensureCanonicalEntityIdentity(entity, {
    tenantId: 8,
    createdAt,
  })
  const second = ensureCanonicalEntityIdentity(entity, {
    tenantId: 8,
    createdAt,
  })

  assert.deepEqual(first.canonicalIdentity, second.canonicalIdentity)
  assert.equal(first.id, second.id)
})

test('runtime objective resolution consumes backend-native persona authority', () => {
  const entity = createTestEntity()
  entity.export = {
    ...entity.export,
    formatsEnabled: [],
  }
  entity.context = {
    ...entity.context,
    styleAnswers: {
      ...entity.context.styleAnswers,
      languageStyle: 'calmo',
    },
  }
  entity.canonicalIdentity = {
    identity: {
      entityId: 'entity-test',
      entityType: 'professional',
      canonicalName: 'Aurora Counsel',
      canonicalSlug: 'aurora-counsel-seed',
      identityVersion: 1,
      genesisFingerprint: 'seeded-fingerprint',
    },
    spark: {
      sparkTone: 'serio',
      sparkPower: 'guidance',
      sparkArchetype: 'signal',
      sparkState: 'guided',
      sparkLifecycleState: 'active',
    },
    persona: {
      businessDescription: 'Orientacao profissional com postura tecnica.',
      personalityTraits: ['technical'],
      communicationStyle: 'technical',
      escalationStyle: 'professional_handoff',
      responseBehaviorProfile: {
        primaryObjective: 'educate',
        riskTolerance: 'low',
        channelMode: 'hybrid',
      },
    },
    transformation: {
      auraProfile: 'signal',
      visualStateDefaults: {
        tone: 'stable',
        intensity: 0.62,
        confidence: 0.72,
      },
      transformationMode: 'signal',
      interactionEnergyProfile: {
        baseline: 0.5,
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

  const objective = resolveObjectiveFromEntityProfile(entity, createOrchestratorCommand({
    type: 'command',
    name: 'start_birth',
    source: 'user',
  }))

  assert.equal(objective?.type, 'educate')
  assert.deepEqual(objective?.constraints, ['backend-native-persona-educate'])
})
