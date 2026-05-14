export type ReplayIdentitySurface =
  | 'adaptive_influence'
  | 'adaptive_equilibrium'
  | 'governance_timeline'

export type ReplayIdentityFieldClassification =
  | 'evidence_derived_identity'
  | 'operational_config_identity'
  | 'request_metadata'
  | 'observability_only'
  | 'prohibited_identity'

export type ReplayIdentityFieldRegistry = {
  evidenceDerivedIdentityFields: readonly string[]
  operationalConfigIdentityFields: readonly string[]
  requestMetadataFields: readonly string[]
  observabilityOnlyFields: readonly string[]
  prohibitedIdentityFields: readonly string[]
}

export type ReplayIdentityWarningCode =
  | 'operational_coupling_identity_field_present'
  | 'request_metadata_identity_field_in_use'
  | 'prohibited_identity_field_in_use'
  | 'unknown_identity_field'

export type ReplayIdentityWarning = {
  code: ReplayIdentityWarningCode
  message: string
  fields: string[]
}

export type ReplayIdentityFieldClassificationMatrix = {
  evidenceDerivedIdentityFields: ReplayIdentityKnownField[]
  operationalConfigIdentityFields: ReplayIdentityKnownField[]
  requestMetadataFields: ReplayIdentityKnownField[]
  observabilityOnlyFields: ReplayIdentityKnownField[]
  prohibitedIdentityFields: ReplayIdentityKnownField[]
}

export type ReplayIdentityFreezeInvariants = {
  generatedAtExcluded: boolean
  requestMetadataExcluded: boolean
  prohibitedFieldsExcluded: boolean
}

export type ReplayIdentityFreezeAssessment = {
  surface: ReplayIdentitySurface
  identityFields: string[]
  warnings: ReplayIdentityWarning[]
  invariants: ReplayIdentityFreezeInvariants
  operationalCouplingDisclosure: {
    coupled: boolean
    fields: string[]
  }
  compatibilityInterpretationNotes: string[]
}

export const REPLAY_IDENTITY_POLICY_VERSION = 1

const EVIDENCE_DERIVED_IDENTITY_FIELDS = [
  'opportunityId',
  'marketSignalId',
  'entityId',
  'baseScore',
  'baseRank',
  'adaptiveMultiplier',
  'finalProjectedScore',
  'projectedRank',
  'rankDelta',
  'blockedReason',
  'rolloutBucket',
  'sampleThresholdSatisfied',
  'projectionMode',
  'weightSources.signal',
  'weightSources.category',
  'weightSources.entity',
  'memoryIds.signal',
  'memoryIds.category',
  'memoryIds.entity',
  'evidence.signal.weightId',
  'evidence.category.weightId',
  'evidence.entity.weightId',
  'replayFingerprint',
  'classification',
  'recommendation',
  'severity',
  'triggerFactors',
  'longitudinalWindow',
  'sourceEvidenceId',
  'events',
  'reducers',
  'compatibility',
  'epistemicConfidence',
  'pagination',
] as const

const OPERATIONAL_CONFIG_IDENTITY_FIELDS = [
  'config.enabled',
  'config.mode',
  'config.killSwitchEnabled',
  'config.rolloutPercentage',
  'config.minimumSampleRequirement',
  'config.allowedScopes',
] as const

const REQUEST_METADATA_FIELDS = [
  'generatedAt',
  'recordedAt',
  'requestId',
  'traceId',
  'servedAt',
  'responseTimeMs',
  'requestDurationMs',
  'lastRefreshDurationMs',
] as const

const OBSERVABILITY_ONLY_FIELDS = [
  'observabilityWritesOnly',
  'observabilityCounters',
  'observabilityTimings',
  'auditWarnings',
] as const

const PROHIBITED_IDENTITY_FIELDS = [
  ...REQUEST_METADATA_FIELDS,
  ...OBSERVABILITY_ONLY_FIELDS,
  'sourceIp',
  'sourceUserAgent',
  'runtimeName',
] as const

export const REPLAY_IDENTITY_FIELD_REGISTRY = {
  evidenceDerivedIdentityFields: EVIDENCE_DERIVED_IDENTITY_FIELDS,
  operationalConfigIdentityFields: OPERATIONAL_CONFIG_IDENTITY_FIELDS,
  requestMetadataFields: REQUEST_METADATA_FIELDS,
  observabilityOnlyFields: OBSERVABILITY_ONLY_FIELDS,
  prohibitedIdentityFields: PROHIBITED_IDENTITY_FIELDS,
} as const satisfies ReplayIdentityFieldRegistry

export type ReplayIdentityKnownField =
  | (typeof REPLAY_IDENTITY_FIELD_REGISTRY.evidenceDerivedIdentityFields)[number]
  | (typeof REPLAY_IDENTITY_FIELD_REGISTRY.operationalConfigIdentityFields)[number]
  | (typeof REPLAY_IDENTITY_FIELD_REGISTRY.requestMetadataFields)[number]
  | (typeof REPLAY_IDENTITY_FIELD_REGISTRY.observabilityOnlyFields)[number]
  | (typeof REPLAY_IDENTITY_FIELD_REGISTRY.prohibitedIdentityFields)[number]

const ADAPTIVE_INFLUENCE_REPLAY_IDENTITY_FIELDS = [
  'opportunityId',
  'marketSignalId',
  'entityId',
  'baseScore',
  'baseRank',
  'adaptiveMultiplier',
  'finalProjectedScore',
  'projectedRank',
  'rankDelta',
  'blockedReason',
  'rolloutBucket',
  'sampleThresholdSatisfied',
  'projectionMode',
  'weightSources.signal',
  'weightSources.category',
  'weightSources.entity',
  'memoryIds.signal',
  'memoryIds.category',
  'memoryIds.entity',
  'config.enabled',
  'config.mode',
  'config.killSwitchEnabled',
  'config.rolloutPercentage',
  'config.minimumSampleRequirement',
  'config.allowedScopes',
  'evidence.signal.weightId',
  'evidence.category.weightId',
  'evidence.entity.weightId',
] as const

const GOVERNANCE_TIMELINE_REPLAY_IDENTITY_FIELDS = [
  'compatibility',
  'epistemicConfidence',
  'reducers',
  'events',
  'pagination',
] as const

const ADAPTIVE_EQUILIBRIUM_REPLAY_IDENTITY_FIELDS = [
  'opportunityId',
  'marketSignalId',
  'baseRank',
  'projectedRank',
  'adaptiveMultiplier',
  'finalProjectedScore',
  'replayFingerprint',
] as const

function dedupe(values: string[]) {
  return [...new Set(values)]
}

function intersection(source: string[], candidates: string[]) {
  const candidateSet = new Set(candidates)
  return source.filter((field) => candidateSet.has(field))
}

function toKnownFieldList(values: readonly string[]): ReplayIdentityKnownField[] {
  return [...values] as ReplayIdentityKnownField[]
}

function buildKnownFieldSet(): ReadonlySet<string> {
  return new Set<string>([
    ...REPLAY_IDENTITY_FIELD_REGISTRY.evidenceDerivedIdentityFields,
    ...REPLAY_IDENTITY_FIELD_REGISTRY.operationalConfigIdentityFields,
    ...REPLAY_IDENTITY_FIELD_REGISTRY.requestMetadataFields,
    ...REPLAY_IDENTITY_FIELD_REGISTRY.observabilityOnlyFields,
    ...REPLAY_IDENTITY_FIELD_REGISTRY.prohibitedIdentityFields,
  ])
}

const KNOWN_REPLAY_IDENTITY_FIELD_SET = buildKnownFieldSet()
const REQUEST_METADATA_FIELDS_SET = new Set<string>(REQUEST_METADATA_FIELDS)
const OBSERVABILITY_ONLY_FIELDS_SET = new Set<string>(OBSERVABILITY_ONLY_FIELDS)
const OPERATIONAL_CONFIG_IDENTITY_FIELDS_SET = new Set<string>(OPERATIONAL_CONFIG_IDENTITY_FIELDS)
const PROHIBITED_IDENTITY_FIELDS_SET = new Set<string>(PROHIBITED_IDENTITY_FIELDS)
const EVIDENCE_DERIVED_IDENTITY_FIELDS_SET = new Set<string>(EVIDENCE_DERIVED_IDENTITY_FIELDS)

function buildCompatibilityInterpretationNotes(args: {
  requestMetadataExcluded: boolean
  prohibitedExcluded: boolean
  operationalCouplingFields: string[]
}) {
  const notes = [
    'Replay identity governance freeze is clarification-only in this phase; no fingerprint algorithm changes are applied.',
  ]

  if (args.requestMetadataExcluded) {
    notes.push('Request metadata (including generatedAt) is excluded from replay identity.')
  } else {
    notes.push('Request metadata leakage detected in replay identity. Treat as governance risk until corrected.')
  }

  if (args.prohibitedExcluded) {
    notes.push('Prohibited identity fields are currently excluded from replay identity surfaces.')
  } else {
    notes.push('Prohibited identity fields detected in replay identity. This violates freeze policy.')
  }

  if (args.operationalCouplingFields.length > 0) {
    notes.push('Operational config coupling is present in replay identity and may induce identity drift without evidence drift.')
  }

  return notes
}

export function getReplayIdentityFieldClassificationMatrix(): ReplayIdentityFieldClassificationMatrix {
  return {
    evidenceDerivedIdentityFields: toKnownFieldList(REPLAY_IDENTITY_FIELD_REGISTRY.evidenceDerivedIdentityFields),
    operationalConfigIdentityFields: toKnownFieldList(REPLAY_IDENTITY_FIELD_REGISTRY.operationalConfigIdentityFields),
    requestMetadataFields: toKnownFieldList(REPLAY_IDENTITY_FIELD_REGISTRY.requestMetadataFields),
    observabilityOnlyFields: toKnownFieldList(REPLAY_IDENTITY_FIELD_REGISTRY.observabilityOnlyFields),
    prohibitedIdentityFields: toKnownFieldList(REPLAY_IDENTITY_FIELD_REGISTRY.prohibitedIdentityFields),
  }
}

export function classifyReplayIdentityField(field: string): ReplayIdentityFieldClassification {
  if (!KNOWN_REPLAY_IDENTITY_FIELD_SET.has(field)) {
    throw new Error(`REPLAY_IDENTITY_UNKNOWN_FIELD: ${field} is not part of the replay identity field registry.`)
  }

  if (REQUEST_METADATA_FIELDS_SET.has(field)) {
    return 'request_metadata'
  }

  if (OBSERVABILITY_ONLY_FIELDS_SET.has(field)) {
    return 'observability_only'
  }

  if (PROHIBITED_IDENTITY_FIELDS_SET.has(field)) {
    return 'prohibited_identity'
  }

  if (OPERATIONAL_CONFIG_IDENTITY_FIELDS_SET.has(field)) {
    return 'operational_config_identity'
  }

  if (EVIDENCE_DERIVED_IDENTITY_FIELDS_SET.has(field)) {
    return 'evidence_derived_identity'
  }

  throw new Error(`REPLAY_IDENTITY_CLASSIFICATION_MISSING: ${field} has no assigned classification.`)
}

export function detectUnknownReplayIdentityFields(fields: string[]) {
  const uniqueFields = dedupe(fields)
  return uniqueFields.filter((field) => !KNOWN_REPLAY_IDENTITY_FIELD_SET.has(field))
}

export function getFrozenReplayIdentityFields(surface: ReplayIdentitySurface) {
  if (surface === 'adaptive_influence') {
    return [...ADAPTIVE_INFLUENCE_REPLAY_IDENTITY_FIELDS]
  }

  if (surface === 'adaptive_equilibrium') {
    return [...ADAPTIVE_EQUILIBRIUM_REPLAY_IDENTITY_FIELDS]
  }

  return [...GOVERNANCE_TIMELINE_REPLAY_IDENTITY_FIELDS]
}

export function assessReplayIdentityFreeze(args: {
  surface: ReplayIdentitySurface
  identityFields: string[]
}): ReplayIdentityFreezeAssessment {
  const identityFields = dedupe(args.identityFields)
  const requestMetadataFields = intersection(identityFields, [...REQUEST_METADATA_FIELDS])
  const prohibitedFields = intersection(identityFields, [...PROHIBITED_IDENTITY_FIELDS])
  const operationalCouplingFields = intersection(identityFields, [...OPERATIONAL_CONFIG_IDENTITY_FIELDS])
  const unknownFields = detectUnknownReplayIdentityFields(identityFields)

  const warnings: ReplayIdentityWarning[] = []

  if (operationalCouplingFields.length > 0) {
    warnings.push({
      code: 'operational_coupling_identity_field_present',
      message: 'Replay identity currently includes operational config fields; this is explicitly disclosed governance coupling.',
      fields: operationalCouplingFields,
    })
  }

  if (requestMetadataFields.length > 0) {
    warnings.push({
      code: 'request_metadata_identity_field_in_use',
      message: 'Request metadata fields are prohibited in replay identity.',
      fields: requestMetadataFields,
    })
  }

  if (prohibitedFields.length > 0) {
    warnings.push({
      code: 'prohibited_identity_field_in_use',
      message: 'Prohibited fields are present in replay identity.',
      fields: prohibitedFields,
    })
  }

  if (unknownFields.length > 0) {
    warnings.push({
      code: 'unknown_identity_field',
      message: 'Replay identity includes unclassified fields; update the governance freeze matrix.',
      fields: unknownFields,
    })
  }

  const invariants: ReplayIdentityFreezeInvariants = {
    generatedAtExcluded: !identityFields.some((field) => field === 'generatedAt'),
    requestMetadataExcluded: requestMetadataFields.length === 0,
    prohibitedFieldsExcluded: prohibitedFields.length === 0,
  }

  return {
    surface: args.surface,
    identityFields,
    warnings,
    invariants,
    operationalCouplingDisclosure: {
      coupled: operationalCouplingFields.length > 0,
      fields: operationalCouplingFields,
    },
    compatibilityInterpretationNotes: buildCompatibilityInterpretationNotes({
      requestMetadataExcluded: invariants.requestMetadataExcluded,
      prohibitedExcluded: invariants.prohibitedFieldsExcluded,
      operationalCouplingFields,
    }),
  }
}

export function validateReplayIdentityFreezeInvariants(args: {
  surface: ReplayIdentitySurface
  identityFields?: string[]
}) {
  const identityFields = args.identityFields ?? getFrozenReplayIdentityFields(args.surface)
  const assessment = assessReplayIdentityFreeze({
    surface: args.surface,
    identityFields,
  })

  return {
    ...assessment.invariants,
    freezeInvariantSatisfied: assessment.invariants.generatedAtExcluded
      && assessment.invariants.requestMetadataExcluded
      && assessment.invariants.prohibitedFieldsExcluded,
  }
}
