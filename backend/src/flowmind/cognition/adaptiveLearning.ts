export type FlowMindAdaptiveDecisionProfile = {
  adaptationConfidence: number
  decisionDrift: number
  safetyProfile: {
    criticalConfidenceThreshold: number
    minimumEvidence: number
    killSwitchEnabled: boolean
  }
  explorationVsExploitationBalance: {
    explorationBias: number
    exploitationBias: number
  }
}

export type FlowMindHistoricalSignals = {
  totalInteractions: number
  reliableEvidenceCount: number
  rollingSuccessRate: number
  rollingContinuationRate: number
  rollingEngagementDelta: number
}

export function createDefaultFlowMindAdaptiveDecisionProfile(): FlowMindAdaptiveDecisionProfile {
  return {
    adaptationConfidence: 0.28,
    decisionDrift: 0.06,
    safetyProfile: {
      criticalConfidenceThreshold: 0.84,
      minimumEvidence: 2,
      killSwitchEnabled: false,
    },
    explorationVsExploitationBalance: {
      explorationBias: 0.5,
      exploitationBias: 0.5,
    },
  }
}

export function createDefaultFlowMindHistoricalSignals(): FlowMindHistoricalSignals {
  return {
    totalInteractions: 0,
    reliableEvidenceCount: 0,
    rollingSuccessRate: 0.5,
    rollingContinuationRate: 0.5,
    rollingEngagementDelta: 0,
  }
}