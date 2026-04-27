import type { HookRewardType, HookTriggerType, HookUserAction } from '../../entity/contracts/HookLoop'
import type { UserMemoryInteraction } from '../../entity/contracts/UserMemory'
import type { RuntimeControl } from './RuntimeControl'

export type OrchestratorCommandName =
  | 'start_birth'
  | 'pause_birth'
  | 'resume_birth'
  | 'stop_birth'
  | 'reset_birth'
  | 'next_stage'
  | 'set_stage'
  | 'apply_control'
  | 'trigger_export'
  | 'register_interaction'
  | 'register_export'
  | 'register_return_visit'
  | 'register_share'

export type OrchestratorCommand = {
  type: 'command'
  name: OrchestratorCommandName
  commandId: string
  issuedAt: string
  source?: 'user' | 'flowmind' | 'system'
  payload?: {
    stageId?: string
    interactionType?: UserMemoryInteraction['type']
    summary?: string
    topics?: string[]
    weight?: number
    triggerType?: HookTriggerType
    action?: HookUserAction
    rewardType?: HookRewardType
    control?: RuntimeControl
    exportFormat?: 'current' | 'square' | 'vertical' | 'post' | 'story'
  }
}

export function createOrchestratorCommand(
  name: OrchestratorCommandName,
  payload?: OrchestratorCommand['payload'],
): OrchestratorCommand {
  return {
    type: 'command',
    name,
    commandId: `command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    issuedAt: new Date().toISOString(),
    source: 'user',
    payload,
  }
}
