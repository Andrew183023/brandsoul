import { describe, expect, it } from 'vitest'

import { deriveFlowMindAuthorityRolloutWindowVisualState } from './deriveFlowMindAuthorityRolloutWindowVisualState'

describe('deriveFlowMindAuthorityRolloutWindowVisualState', () => {
  it('highlights the post-safe-mapping window when the new sample is sufficient', () => {
    const state = deriveFlowMindAuthorityRolloutWindowVisualState({
      overall: {
        sampleSize: 7,
        grantedCount: 2,
        deniedCount: 5,
        divergenceBySemanticDrift: 0,
        divergenceByActionDrift: 1,
        divergenceByConfidenceMargin: 2,
        deniedReasonCounts: [],
        deniedByCommand: [],
        deniedByZone: [],
        recentPattern: [],
      },
      postSafeMapping: {
        sampleSize: 5,
        grantedCount: 2,
        deniedCount: 3,
        divergenceBySemanticDrift: 0,
        divergenceByActionDrift: 0,
        divergenceByConfidenceMargin: 1,
        deniedReasonCounts: [],
        deniedByCommand: [],
        deniedByZone: [],
        recentPattern: [],
      },
      preSafeMappingSampleSize: 2,
      postSafeMappingSampleSize: 5,
      comparisonWindowLabel: 'histórico misto com janela pós-safe-mapping suficiente',
    })

    expect(state.historyLabel).toBe('histórico geral 7')
    expect(state.postWindowLabel).toBe('pós-safe-mapping 5')
    expect(state.postWindowHint).toContain('janela nova já consegue orientar')
    expect(state.postSafeMapping.divergenceConfidenceLabel).toBe('confiança marginal 1')
  })
})