import type { EntityAction } from '../brain/domain/entity/contracts/EntityAction.js'
import type { FlowMindDecisionOutput } from '../brain/domain/entity/contracts/FlowMindState.js'
import type { LearningOutcome } from '../brain/flowmind/learningEngine.js'

export type FlowMindUiEffect =
  | {
      effectId: string
      entityId: string
      kind: 'message'
      title: string
      body: string
      createdAt: string
    }
  | {
      effectId: string
      entityId: string
      kind: 'prompt'
      title: string
      question: string
      placeholder?: string
      createdAt: string
    }
  | {
      effectId: string
      entityId: string
      kind: 'discovery'
      title: string
      body: string
      href: string
      ctaLabel: string
      createdAt: string
    }
  | {
      effectId: string
      entityId: string
      kind: 'export'
      title: string
      body: string
      exportFormat: 'current' | 'square' | 'vertical' | 'post' | 'story'
      createdAt: string
    }

export type EntityScheduledTaskType = 'return_prompt' | 'follow_up' | 'reminder' | 'social_action'

export type EntityScheduledTask = {
  taskId: string
  entityId: string
  type: EntityScheduledTaskType
  createdAt: string
  runAt: string
  delayMs: number
  payload: {
    uiEffect?: FlowMindUiEffect
    event?: {
      type: 'event'
      eventId: string
      timestamp: string
      sessionId?: string
      entityId: string
      causedByCommandId?: string
      name: string
      payload?: Record<string, unknown>
    }
  }
}

export type FlowMindFollowUpCommandName =
  | 'register_interaction'
  | 'register_return_visit'
  | 'register_share'
  | 'trigger_export'
  | 'set_stage'

export type FlowMindFollowUpCommand = {
  type: 'command'
  name: FlowMindFollowUpCommandName
  commandId: string
  issuedAt: string
  classification: 'domain-command'
  payload?: {
    stageId?: string
    interactionType?: string
    summary?: string
    topics?: string[]
    weight?: number
    exportFormat?: 'current' | 'square' | 'vertical' | 'post' | 'story'
  }
}

export type FlowMindLineageTrace = {
  rootCommandId: string
  reentryBlocked: boolean
  entityAction: Pick<EntityAction, 'type' | 'priority' | 'confidence' | 'createdAt' | 'source'>
  followUps: Array<{
    commandId: string
    name: FlowMindFollowUpCommandName
    classification: 'domain-command'
    issuedAt: string
    appliedEventIds?: string[]
  }>
}

export type FlowMindDecisionEnvelope = {
  decision: Pick<FlowMindDecisionOutput, 'intent' | 'confidence' | 'reason'>
  trace: FlowMindDecisionOutput['trace']
  lineage: FlowMindLineageTrace
  outcome: {
    decisionConfidence: LearningOutcome['decisionConfidence']
    impact: LearningOutcome['impact']
  }
}