import { buildFinalPersona } from '../../../persona-lab/core/finalPersonaBuilder'
import type { EntityBehavior } from '../contracts/EntityBehavior'
import type { EntityFinalForm } from '../contracts/EntityFinalForm'
import type { EntityInput } from '../contracts/EntityInput'
import type { EntityMorphology } from '../contracts/EntityMorphology'
import type { EntityProfile } from '../contracts/EntityProfile'
import { buildLocalEntityProfile } from '../mappers/entityProfileMapper'
import { buildEntityExportProfile } from '../services/exportProfileEngine'
import { buildEntitySocialProfile } from '../services/socialProfileEngine'
import type { EntityManifestation } from '../../manifestation/contracts/EntityManifestation'
import type { RuntimeControl } from '../../orchestration/contracts/RuntimeControl'
import type { PersonaLabPreview } from '../../rendering/contracts/types'
import type { PersonaDNA } from '../../persona-dna/contracts/PersonaDNA'
import type { ProcessedShape } from '../../shape/contracts/ProcessedShape'

export function buildEntityProfile(args: {
  input: EntityInput
  manifestation: EntityManifestation
  preview: PersonaLabPreview
  personaDNA?: PersonaDNA
  visualArchetype?: EntityProfile['visualArchetype']
  visualBodyPlan?: EntityProfile['visualBodyPlan']
  visualFinishPlan?: EntityProfile['visualFinishPlan']
  morphology?: EntityMorphology
  behavior?: EntityBehavior
  relational?: EntityProfile['relational']
  finalForm?: EntityFinalForm
  processedShape?: ProcessedShape
  runtimeControl?: RuntimeControl
  id?: string
  requestId?: string
  sessionId?: string
  source?: EntityProfile['source']
}): EntityProfile {
  const entity = buildLocalEntityProfile({
    input: args.input,
    manifestation: args.manifestation,
    personaDNA: args.personaDNA,
    visualArchetype: args.visualArchetype ?? args.preview.visualArchetype,
    visualBodyPlan: args.visualBodyPlan,
    visualFinishPlan: args.visualFinishPlan,
    processedShape: args.processedShape,
    runtimeControl: args.runtimeControl,
    id: args.id,
    requestId: args.requestId,
    sessionId: args.sessionId,
  })

  const finalIdentity = buildFinalPersona(args.preview, {
    brandCategory: args.input.context.brandCategory,
    styleAnswers: args.input.context.styleAnswers,
    visualEssence: args.input.brand.visualEssence,
  })

  return {
    ...entity,
    source: args.source ?? 'backend-engine',
    social: buildEntitySocialProfile({
      entityId: entity.id,
      input: args.input,
      manifestation: args.manifestation,
      publicName: finalIdentity.name,
      handleSeed: finalIdentity.name,
      createdAt: entity.metadata.createdAt,
      visibility: entity.social.visibility,
    }),
    export: buildEntityExportProfile({
      entityId: entity.id,
      input: args.input,
      manifestation: args.manifestation,
      lastExportAt: entity.export.lastExportAt,
    }),
    personaDNA: args.personaDNA ?? entity.personaDNA,
    visualArchetype: args.visualArchetype ?? args.preview.visualArchetype ?? entity.visualArchetype,
    visualBodyPlan: args.visualBodyPlan ?? entity.visualBodyPlan,
    visualFinishPlan: args.visualFinishPlan ?? args.preview.visualFinishPlan ?? entity.visualFinishPlan,
    morphology: args.morphology ?? entity.morphology,
    behavior: args.behavior ?? entity.behavior,
    relational: args.relational ?? entity.relational,
    finalForm: {
      ...(args.finalForm ?? entity.finalForm),
      identity: finalIdentity,
    },
  }
}
