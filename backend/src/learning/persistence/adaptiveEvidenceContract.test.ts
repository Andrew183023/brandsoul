import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CURRENT_ADAPTIVE_EVIDENCE_CONTRACT_VERSION,
  assessAdaptiveEvidenceCompatibility,
  buildAdaptiveEvidenceCompatibilitySummary,
  buildCurrentAdaptiveEvidenceContractMetadata,
  resolveAdaptiveEvidenceContractVersion,
  resolveAdaptiveEvidenceGenerationMetadata,
  resolveAdaptiveEvidenceReducerSemanticMetadata,
  resolveAdaptiveEvidenceSemanticVersionMetadata,
} from './adaptiveEvidenceContract.js'

test('adaptive evidence contract persists current semantic version metadata defaults', () => {
  const contract = buildCurrentAdaptiveEvidenceContractMetadata()

  assert.equal(contract.evidenceContractVersion, CURRENT_ADAPTIVE_EVIDENCE_CONTRACT_VERSION)
  assert.equal(contract.semanticVersionMetadata.replaySemanticsVersion, '1.0.0')
  assert.equal(contract.reducerSemanticMetadata.weightedStabilityScoreReducerVersion, 'weighted_longitudinal_stability_v1')
  assert.equal(contract.evidenceGenerationMetadata.replayInterpretationMode, 'version_aware')
})

test('adaptive evidence compatibility classifies legacy and semantic deltas truthfully', () => {
  const current = buildCurrentAdaptiveEvidenceContractMetadata()
  const fully = assessAdaptiveEvidenceCompatibility(current)
  const legacy = assessAdaptiveEvidenceCompatibility({
    evidenceContractVersion: resolveAdaptiveEvidenceContractVersion(null),
    semanticVersionMetadata: resolveAdaptiveEvidenceSemanticVersionMetadata(null, 'legacy-unversioned'),
    reducerSemanticMetadata: resolveAdaptiveEvidenceReducerSemanticMetadata(null, 'legacy-unversioned'),
    evidenceGenerationMetadata: resolveAdaptiveEvidenceGenerationMetadata(null, 'legacy-unversioned'),
  })
  const incompatible = assessAdaptiveEvidenceCompatibility({
    ...current,
    semanticVersionMetadata: {
      ...current.semanticVersionMetadata,
      replaySemanticsVersion: '2.0.0',
    },
  })

  assert.equal(fully.classification, 'FULLY_COMPATIBLE')
  assert.equal(legacy.classification, 'PARTIALLY_COMPATIBLE')
  assert.equal(legacy.longitudinalComparisonSafe, false)
  assert.equal(incompatible.classification, 'INCOMPATIBLE')
  assert.equal(incompatible.replayInterpretationSafe, false)
})

test('adaptive evidence compatibility summary safeguards longitudinal interpretation without mutating replay semantics', () => {
  const current = buildCurrentAdaptiveEvidenceContractMetadata()
  const legacy = {
    evidenceContractVersion: 'legacy-unversioned',
    semanticVersionMetadata: resolveAdaptiveEvidenceSemanticVersionMetadata(null, 'legacy-unversioned'),
    reducerSemanticMetadata: resolveAdaptiveEvidenceReducerSemanticMetadata(null, 'legacy-unversioned'),
    evidenceGenerationMetadata: resolveAdaptiveEvidenceGenerationMetadata(null, 'legacy-unversioned'),
  }

  const summary = buildAdaptiveEvidenceCompatibilitySummary([current, legacy])

  assert.equal(summary.highestRiskClassification, 'PARTIALLY_COMPATIBLE')
  assert.equal(summary.longitudinalComparisonSafe, false)
  assert.equal(summary.replayInterpretationSafe, true)
  assert.equal(summary.requiresVersionAwareInterpretation, true)
  assert.equal(summary.versions.length, 2)
})
