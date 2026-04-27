import type { EntityActionType } from '../brain/domain/entity/contracts/EntityAction.js'
import type { OrchestratorCommand } from './orchestratorState.js'

export function mapSafeSovereignActionToEntityActionType(
  commandName: OrchestratorCommand['name'],
  sovereignAction: string,
): EntityActionType | undefined {
  const normalized = sovereignAction.trim().toLowerCase()

  if (commandName === 'trigger_export') {
    return normalized === 'sell' ? 'triggerExport' : undefined
  }

  if (commandName === 'start_birth' || commandName === 'resume_birth') {
    if (normalized === 'guide') {
      return 'sendMessage'
    }

    if (normalized === 'support') {
      return 'askQuestion'
    }
  }

  return undefined
}