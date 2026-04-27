import type { OrchestratorCommand } from '../../domain/orchestration/contracts/OrchestratorCommand'
import type { RuntimeControl } from '../../domain/orchestration/contracts/RuntimeControl'

export type CommandRequest = {
  type: 'command'
  name: OrchestratorCommand['name']
  commandId: string
  issuedAt: string
  source?: 'user' | 'flowmind' | 'system'
  payload?: {
    stageId?: string
    control?: RuntimeControl
    exportFormat?: 'current' | 'square' | 'vertical' | 'post' | 'story'
    summary?: string
  }
}