import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessReplayIdentityFreeze,
  classifyReplayIdentityField,
  detectUnknownReplayIdentityFields,
  getFrozenReplayIdentityFields,
  getReplayIdentityFieldClassificationMatrix,
  validateReplayIdentityFreezeInvariants,
} from './replayIdentityGovernancePolicy.js'

test('prohibited fields excluded from frozen replay identity sets', () => {
  const matrix = getReplayIdentityFieldClassificationMatrix()
  const prohibited = new Set<string>(matrix.prohibitedIdentityFields)

  const adaptiveFields = getFrozenReplayIdentityFields('adaptive_influence')
  const adaptiveProhibited = adaptiveFields.filter((field) => prohibited.has(field))
  assert.deepEqual(adaptiveProhibited, [])

  const adaptiveEquilibriumFields = getFrozenReplayIdentityFields('adaptive_equilibrium')
  const adaptiveEquilibriumProhibited = adaptiveEquilibriumFields.filter((field) => prohibited.has(field))
  assert.deepEqual(adaptiveEquilibriumProhibited, [])

  const governanceFields = getFrozenReplayIdentityFields('governance_timeline')
  const governanceProhibited = governanceFields.filter((field) => prohibited.has(field))
  assert.deepEqual(governanceProhibited, [])
})

test('request metadata fields remain excluded from replay identity', () => {
  const matrix = getReplayIdentityFieldClassificationMatrix()
  assert.equal(matrix.requestMetadataFields.includes('generatedAt'), true)

  const governanceAssessment = assessReplayIdentityFreeze({
    surface: 'governance_timeline',
    identityFields: getFrozenReplayIdentityFields('governance_timeline'),
  })

  assert.equal(governanceAssessment.invariants.generatedAtExcluded, true)
  assert.equal(governanceAssessment.invariants.requestMetadataExcluded, true)
  assert.equal(
    governanceAssessment.warnings.some((warning) => warning.code === 'request_metadata_identity_field_in_use'),
    false,
  )
})

test('operational coupling disclosure is explicit for adaptive influence identity freeze', () => {
  const adaptiveAssessment = assessReplayIdentityFreeze({
    surface: 'adaptive_influence',
    identityFields: getFrozenReplayIdentityFields('adaptive_influence'),
  })

  assert.equal(adaptiveAssessment.operationalCouplingDisclosure.coupled, true)
  assert.equal(adaptiveAssessment.operationalCouplingDisclosure.fields.includes('config.mode'), true)
  assert.equal(
    adaptiveAssessment.warnings.some((warning) => warning.code === 'operational_coupling_identity_field_present'),
    true,
  )
})

test('replay identity freeze invariants hold for frozen governance timeline identity fields', () => {
  const invariants = validateReplayIdentityFreezeInvariants({
    surface: 'governance_timeline',
  })

  assert.equal(invariants.generatedAtExcluded, true)
  assert.equal(invariants.requestMetadataExcluded, true)
  assert.equal(invariants.prohibitedFieldsExcluded, true)
  assert.equal(invariants.freezeInvariantSatisfied, true)
})

test('replay identity field classification is explicit for request, observability, prohibited, and operational fields', () => {
  assert.equal(classifyReplayIdentityField('generatedAt'), 'request_metadata')
  assert.equal(classifyReplayIdentityField('observabilityCounters'), 'observability_only')
  assert.equal(classifyReplayIdentityField('sourceIp'), 'prohibited_identity')
  assert.equal(classifyReplayIdentityField('config.mode'), 'operational_config_identity')
  assert.equal(classifyReplayIdentityField('replayFingerprint'), 'evidence_derived_identity')
})

test('unknown replay identity fields are detected and classify call rejects them', () => {
  const unknown = detectUnknownReplayIdentityFields([
    'entityId',
    'generatedAt',
    'unregisteredRuntimeField',
    'unregisteredRuntimeField',
  ])

  assert.deepEqual(unknown, ['unregisteredRuntimeField'])
  assert.throws(
    () => classifyReplayIdentityField('unregisteredRuntimeField'),
    /REPLAY_IDENTITY_UNKNOWN_FIELD/,
  )
})
