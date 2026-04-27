export type FlowMindPolicyProfile = {
  policyMode: 'balanced' | 'restrictive' | 'adaptive'
  policyStability: number
  policyDrift: number
  confidenceAdjustmentProfile: {
    evidenceThreshold: number
  }
}

export function createDefaultFlowMindPolicyProfile(): FlowMindPolicyProfile {
  return {
    policyMode: 'balanced',
    policyStability: 0.62,
    policyDrift: 0.08,
    confidenceAdjustmentProfile: {
      evidenceThreshold: 2,
    },
  }
}