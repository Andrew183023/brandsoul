import { describe, expect, it } from 'vitest'

import { deriveFlowMindAuthorityAggregationVisualState } from './deriveFlowMindAuthorityAggregationVisualState'

describe('deriveFlowMindAuthorityAggregationVisualState', () => {
  it('summarizes top reasons, commands and recent pattern', () => {
    const state = deriveFlowMindAuthorityAggregationVisualState({
      sampleSize: 5,
      grantedCount: 1,
      deniedCount: 4,
      divergenceBySemanticDrift: 1,
      divergenceByActionDrift: 1,
      divergenceByConfidenceMargin: 2,
      deniedReasonCounts: [
        { reason: 'divergence-too-high', count: 2 },
        { reason: 'insufficient-sample-size', count: 1 },
        { reason: 'command-zone-prohibited', count: 1 },
      ],
      deniedByCommand: [
        { command: 'trigger_export', deniedCount: 2, grantedCount: 1, topDeniedReason: 'divergence-too-high' },
        { command: 'apply_control', deniedCount: 1, grantedCount: 0, topDeniedReason: 'command-zone-prohibited' },
      ],
      deniedByZone: [
        { zone: 'safe', deniedCount: 3 },
        { zone: 'prohibited', deniedCount: 1 },
      ],
      recentPattern: [
        { observedAt: '2026-04-19T19:00:00.000Z', command: 'trigger_export', zone: 'safe', outcome: 'denied', deniedReason: 'divergence-too-high' },
        { observedAt: '2026-04-19T19:01:00.000Z', command: 'trigger_export', zone: 'safe', outcome: 'granted' },
      ],
    })

    expect(state.headline).toBe('4 negados / 1 concedidos')
    expect(state.topReasons[0]).toBe('divergência alta ×2')
    expect(state.topCommands[0]).toContain('trigger_export 2 negados')
    expect(state.divergenceConfidenceLabel).toBe('confiança marginal 2')
    expect(state.divergenceRealLabel).toBe('drift real 2')
    expect(state.divergenceRealDetailLabel).toBe('semântico 1 · ação 1')
    expect(state.recentPattern).toEqual(['trigger_export deny', 'trigger_export grant'])
  })

  it('returns empty state when active window is missing', () => {
    const state = deriveFlowMindAuthorityAggregationVisualState(undefined)

    expect(state.headline).toBe('sem janela ativa')
    expect(state.topReasons).toEqual([])
    expect(state.divergenceConfidenceLabel).toBeUndefined()
  })
})