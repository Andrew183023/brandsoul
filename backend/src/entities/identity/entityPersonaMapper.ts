import type {
  CanonicalEntityIdentity,
  CanonicalEntityType,
  CanonicalInteractionEnergyProfile,
  CanonicalResponseBehaviorProfile,
  CanonicalSparkLifecycleState,
  CanonicalSparkState,
  CanonicalVisualStateDefaults,
  EntityProfile,
} from '../../brain/domain/entity/contracts/EntityProfile.js'

type PersonalityTraits = CanonicalEntityIdentity['persona']['personalityTraits']

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readExportFormats(entityProfile: EntityProfile) {
  return Array.isArray(entityProfile.export?.formatsEnabled) ? entityProfile.export.formatsEnabled : []
}

function readBehaviorTone(entityProfile: EntityProfile) {
  return readString(entityProfile.behavior?.tone)
}

function readMorphologyArchetype(entityProfile: EntityProfile) {
  return readString(entityProfile.morphology?.archetype)
}

function readManifestationMode(entityProfile: EntityProfile) {
  return readString(entityProfile.manifestation?.mode)
}

function readManifestationVariant(entityProfile: EntityProfile) {
  return readString(entityProfile.manifestation?.variant)
}

function readProgressionLevel(entityProfile: EntityProfile) {
  return readNumber(entityProfile.relational?.progression?.level) ?? 0
}

function readStyleAnswer(entityProfile: EntityProfile, key: string) {
  const styleAnswers = entityProfile.context?.styleAnswers as Record<string, unknown> | undefined
  const value = styleAnswers?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readIdentityText(entityProfile: EntityProfile, key: 'socialLine' | 'manifesto' | 'openingLine') {
  const value = entityProfile.finalForm?.identity?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readBusinessDescription(entityProfile: EntityProfile) {
  return entityProfile.metadata.businessConfig?.description
    ?? readIdentityText(entityProfile, 'manifesto')
    ?? readIdentityText(entityProfile, 'socialLine')
}

function inferCommunicationStyle(entityProfile: EntityProfile) {
  return readStyleAnswer(entityProfile, 'languageStyle')
    ?? readBehaviorTone(entityProfile)
    ?? 'balanced'
}

function inferPersonalityTraits(entityProfile: EntityProfile): PersonalityTraits {
  const candidates = [
    readStyleAnswer(entityProfile, 'brandStyle'),
    readStyleAnswer(entityProfile, 'actionStyle'),
    entityProfile.context?.brandCategory,
    entityProfile.morphology?.archetype,
  ]

  return candidates.filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
}

function inferResponseBehaviorProfile(entityType: CanonicalEntityType, entityProfile: EntityProfile): CanonicalResponseBehaviorProfile {
  const communicationStyle = inferCommunicationStyle(entityProfile)

  if (entityType === 'legal' || entityType === 'professional') {
    return {
      primaryObjective: 'guide',
      riskTolerance: 'low',
      channelMode: 'hybrid',
    }
  }

  if (communicationStyle === 'technical') {
    return {
      primaryObjective: 'educate',
      riskTolerance: 'low',
      channelMode: 'public',
    }
  }

  if (readExportFormats(entityProfile).length > 0) {
    return {
      primaryObjective: 'convert',
      riskTolerance: 'medium',
      channelMode: 'public',
    }
  }

  return {
    primaryObjective: 'engage',
    riskTolerance: 'medium',
    channelMode: 'public',
  }
}

export function deriveCanonicalPersona(entityProfile: EntityProfile, entityType: CanonicalEntityType): CanonicalEntityIdentity['persona'] {
  return {
    businessDescription: readBusinessDescription(entityProfile),
    personalityTraits: inferPersonalityTraits(entityProfile),
    communicationStyle: inferCommunicationStyle(entityProfile),
    escalationStyle: entityType === 'legal' || entityType === 'professional' ? 'professional_handoff' : 'guided_resolution',
    responseBehaviorProfile: inferResponseBehaviorProfile(entityType, entityProfile),
  }
}

function inferSparkTone(entityProfile: EntityProfile) {
  return inferCommunicationStyle(entityProfile)
}

function inferSparkPower(entityType: CanonicalEntityType, entityProfile: EntityProfile) {
  const actionStyle = readStyleAnswer(entityProfile, 'actionStyle')
  if (entityType === 'legal' || entityType === 'professional') {
    return 'guidance'
  }

  if (actionStyle === 'consultive' || actionStyle === 'orientar') {
    return 'clarity'
  }

  return readExportFormats(entityProfile).length > 0 ? 'attraction' : 'support'
}

function inferSparkState(entityProfile: EntityProfile): CanonicalSparkState {
  const communicationStyle = inferCommunicationStyle(entityProfile)
  if (communicationStyle === 'technical') {
    return 'focused'
  }

  if (entityProfile.runtime?.flowMind?.killSwitchEnabled) {
    return 'protected'
  }

  return readExportFormats(entityProfile).length > 0 ? 'expansive' : 'guided'
}

function inferSparkLifecycleState(entityProfile: EntityProfile): CanonicalSparkLifecycleState {
  if (entityProfile.runtime?.flowMind?.mode === 'active') {
    return 'active'
  }

  if (readProgressionLevel(entityProfile) > 1) {
    return 'evolving'
  }

  return 'initialized'
}

export function deriveCanonicalSpark(entityProfile: EntityProfile, entityType: CanonicalEntityType): CanonicalEntityIdentity['spark'] {
  return {
    sparkTone: inferSparkTone(entityProfile),
    sparkPower: inferSparkPower(entityType, entityProfile),
    sparkArchetype: readMorphologyArchetype(entityProfile) ?? readManifestationMode(entityProfile) ?? entityType,
    sparkState: inferSparkState(entityProfile),
    sparkLifecycleState: inferSparkLifecycleState(entityProfile),
  }
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function deriveVisualStateDefaults(entityProfile: EntityProfile): CanonicalVisualStateDefaults {
  const intensity = typeof entityProfile.finalForm?.core?.intensity === 'number'
    ? entityProfile.finalForm.core.intensity
    : typeof entityProfile.finalForm?.field?.intensity === 'number'
      ? entityProfile.finalForm.field.intensity
      : 0.56
  const confidence = typeof entityProfile.metadata.confidence === 'number'
    ? entityProfile.metadata.confidence
    : clamp(entityProfile.relational?.userMemory?.memoryConfidence ?? 0.5)

  return {
    tone: inferCommunicationStyle(entityProfile),
    intensity: Math.round(clamp(intensity, 0.18, 0.96) * 1000) / 1000,
    confidence: Math.round(clamp(confidence) * 1000) / 1000,
  }
}

function deriveInteractionEnergyProfile(entityProfile: EntityProfile): CanonicalInteractionEnergyProfile {
  const pulse = typeof entityProfile.behavior?.rhythm?.pulse === 'number'
    ? clamp(entityProfile.behavior.rhythm.pulse)
    : 0.5

  return {
    baseline: Math.round(pulse * 1000) / 1000,
    supportBias: -0.05,
    guideBias: 0.03,
    sellBias: 0.08,
    refuseBias: -0.08,
  }
}

export function deriveCanonicalTransformation(entityProfile: EntityProfile): CanonicalEntityIdentity['transformation'] {
  return {
    auraProfile: readManifestationMode(entityProfile) ?? readMorphologyArchetype(entityProfile) ?? 'brand-avatar',
    visualStateDefaults: deriveVisualStateDefaults(entityProfile),
    transformationMode: readManifestationVariant(entityProfile) ?? readManifestationMode(entityProfile) ?? 'balanced',
    interactionEnergyProfile: deriveInteractionEnergyProfile(entityProfile),
  }
}
