import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { FlowMindOutput, FlowMindDecisionAdapter, EntityCognitiveMemory } from '../flowmind/index.js'
import type { OrchestratorCommand, OrchestratorState } from '../orchestrator/orchestratorState.js'

export type FlowMindServiceMode = 'disabled' | 'shadow' | 'dry-run' | 'debug' | 'active'

export type FlowMindAdapterLoadStatus = 'loaded' | 'backend-base-only' | 'load-failed'

export type FlowMindAuthorityScopeZone = 'safe' | 'prohibited' | 'future'

export type FlowMindAutonomyLevel = 'manual' | 'supervised' | 'partial' | 'autonomous'

export type FlowMindAutonomyMetrics = {
  averageErrorRate: number
  decisionStability: number
  averageDivergenceScore: number
  sampleSize: number
}

export type FlowMindServiceInvocation = {
  entityProfile: EntityProfile
  state: OrchestratorState
  command: OrchestratorCommand
  now?: string
  memory?: EntityCognitiveMemory
  persistMemory?: boolean
}

export type FlowMindServiceSummary = {
  mode: Exclude<FlowMindServiceMode, 'disabled'>
  adapterName: string
  adapterLoadStatus: FlowMindAdapterLoadStatus
  invokedAt: string
  decisionSource: FlowMindOutput['decisionSource']
  terminalAuthority: FlowMindOutput['terminalAuthority']
  semanticFrozen: FlowMindOutput['semanticFrozen']
  lowRiskLaneUsed?: FlowMindOutput['lowRiskLaneUsed']
  fallbackConditions: FlowMindOutput['fallbackConditions']
  fallbackUsed: boolean
  fallbackReason?: string
  decision: Pick<FlowMindOutput['decision'], 'intent' | 'action' | 'confidence'>
  objectiveType?: string
}

export type FlowMindLegacyDecisionComparisonView = {
  commandId: string
  commandName: OrchestratorCommand['name']
  evaluatedAt: string
  authority: 'orchestrator-legacy'
  intent: string
  action: string
  confidence: number
}

export type FlowMindShadowDecisionComparisonView = {
  commandId: string
  commandName: OrchestratorCommand['name']
  evaluatedAt: string
  intent: string
  action: string
  confidence: number
  decisionSource: FlowMindOutput['decisionSource']
  terminalAuthority: FlowMindOutput['terminalAuthority']
  semanticFrozen: FlowMindOutput['semanticFrozen']
  lowRiskLaneUsed?: FlowMindOutput['lowRiskLaneUsed']
  fallbackUsed: boolean
}

export type FlowMindDecisionDivergenceType =
  | 'aligned'
  | 'intent-drift'
  | 'action-drift'
  | 'semantic-drift'
  | 'authority-shift'
  | 'semantic-and-authority-drift'

export type FlowMindSemanticDifference = {
  intentChanged: boolean
  actionChanged: boolean
  confidenceDelta: number
  summary: string
}

export type FlowMindAuthorityDifference = {
  authorityChanged: boolean
  legacyAuthority: 'orchestrator-legacy'
  flowMindDecisionSource: FlowMindOutput['decisionSource']
  flowMindTerminalAuthority: FlowMindOutput['terminalAuthority']
  semanticFrozen: FlowMindOutput['semanticFrozen']
  summary: string
}

export type FlowMindComparisonMetrics = {
  divergenceScore: number
  stabilityScore: number
  fallbackRate: number
  adaptiveSuccessRate: number
  sampleSize: number
}

export type FlowMindAuthorityObservation = {
  authorityEligible: boolean
  authorityGranted: boolean
  authorityDeniedReason?: string
  authorityZone: FlowMindAuthorityScopeZone
  authorityCommand: OrchestratorCommand['name']
  autonomyLevel?: FlowMindAutonomyLevel
  promotionEligible?: boolean
  rollbackTriggered?: boolean
  rollbackReason?: string
  autonomyMetrics?: FlowMindAutonomyMetrics
}

export type FlowMindDecisionComparison = {
  legacyDecision: FlowMindLegacyDecisionComparisonView
  flowMindDecision: FlowMindShadowDecisionComparisonView
  divergenceType: FlowMindDecisionDivergenceType
  semanticDifference: FlowMindSemanticDifference
  authorityDifference: FlowMindAuthorityDifference
  metrics: FlowMindComparisonMetrics
}

export type FlowMindServiceResult = {
  mode: Exclude<FlowMindServiceMode, 'disabled'>
  summary: FlowMindServiceSummary
  output: FlowMindOutput
}

export interface FlowMindPort {
  readonly mode: FlowMindServiceMode
  readonly adapter?: FlowMindDecisionAdapter
  evaluateOrchestratorCommand(input: FlowMindServiceInvocation): Promise<FlowMindServiceResult | undefined>
}
