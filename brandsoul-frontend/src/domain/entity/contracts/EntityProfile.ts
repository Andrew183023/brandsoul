import type { EntityInput } from './EntityInput'
import type { EntityExportProfile } from './EntityExportProfile'
import type { EntitySocialProfile } from './EntitySocialProfile'
import type { EntityMorphology } from './EntityMorphology'
import type { EntityBehavior } from './EntityBehavior'
import type { EntityFinalForm } from './EntityFinalForm'
import type { EntityBindingState } from './EntityBindingState'
import type { EntityAccumulatedValue } from './EntityAccumulatedValue'
import type { EntityTimelineLog } from './EntityTimelineLog'
import type { BehaviorState } from './BehaviorState'
import type { HookLoop } from './HookLoop'
import type { IdentityImprint } from './IdentityImprint'
import type { ProgressionState } from './ProgressionState'
import type { UserMemory } from './UserMemory'
import type { EntityManifestation } from '../../manifestation/contracts/EntityManifestation'
import type { RuntimeControl } from '../../orchestration/contracts/RuntimeControl'
import type { RenderOutput } from '../../rendering/contracts/RenderOutput'
import type { PersonaDNA } from '../../persona-dna/contracts/PersonaDNA'
import type { VisualFinishPlan } from '../../materialization/contracts/VisualFinishPlan'
import type { VisualArchetype } from '../../visual-archetype/contracts/VisualArchetype'
import type { VisualBodyPlan } from '../../visual-archetype/contracts/VisualBodyPlan'

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
  personaDNA: PersonaDNA
  visualArchetype: VisualArchetype
  visualBodyPlan: VisualBodyPlan
  visualFinishPlan: VisualFinishPlan
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
  runtime?: {
    control?: RuntimeControl
    renderOutput?: RenderOutput
  }
  metadata: {
    createdAt: string
    updatedAt?: string
    requestId?: string
    sessionId?: string
    confidence?: number
    notes?: string[]
  }
}
