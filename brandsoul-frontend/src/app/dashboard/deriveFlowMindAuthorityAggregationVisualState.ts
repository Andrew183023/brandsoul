type DeniedReasonCount = {
  reason: string
  count: number
}

type DeniedByCommand = {
  command: string
  deniedCount: number
}

type RecentPatternEntry = {
  command: string
  outcome: 'denied' | 'granted'
}

type Aggregation = {
  sampleSize: number
  grantedCount: number
  deniedCount: number
  divergenceBySemanticDrift: number
  divergenceByActionDrift: number
  divergenceByConfidenceMargin: number
  deniedReasonCounts: DeniedReasonCount[]
  deniedByCommand: DeniedByCommand[]
  recentPattern: RecentPatternEntry[]
}

function translateReason(reason: string) {
  if (reason === 'divergence-too-high') return 'divergência alta'
  if (reason === 'insufficient-sample-size') return 'amostra insuficiente'
  if (reason === 'command-zone-prohibited') return 'zona/comando proibido'
  return reason
}

export function deriveFlowMindAuthorityAggregationVisualState(aggregation: Aggregation | undefined) {
  if (!aggregation) {
    return {
      headline: 'sem janela ativa',
      topReasons: [],
      topCommands: [],
      recentPattern: [],
      divergenceConfidenceLabel: undefined,
      divergenceRealLabel: undefined,
      divergenceRealDetailLabel: undefined,
    }
  }

  const driftReal = aggregation.divergenceBySemanticDrift + aggregation.divergenceByActionDrift

  return {
    headline: `${aggregation.deniedCount} negados / ${aggregation.grantedCount} concedidos`,
    topReasons: aggregation.deniedReasonCounts.map((item) => `${translateReason(item.reason)} ×${item.count}`),
    topCommands: aggregation.deniedByCommand.map((item) => `${item.command} ${item.deniedCount} negados`),
    recentPattern: aggregation.recentPattern.map((item) => `${item.command} ${item.outcome === 'denied' ? 'deny' : 'grant'}`),
    divergenceConfidenceLabel: `confiança marginal ${aggregation.divergenceByConfidenceMargin}`,
    divergenceRealLabel: `drift real ${driftReal}`,
    divergenceRealDetailLabel: `semântico ${aggregation.divergenceBySemanticDrift} · ação ${aggregation.divergenceByActionDrift}`,
  }
}