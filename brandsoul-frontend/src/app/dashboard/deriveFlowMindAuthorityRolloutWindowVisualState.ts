type AuthorityAggregationWindow = {
  sampleSize: number
  divergenceByConfidenceMargin: number
}

type AuthorityRolloutWindow = {
  overall: AuthorityAggregationWindow
  postSafeMapping?: AuthorityAggregationWindow
  postSafeMappingSampleSize: number
}

export function deriveFlowMindAuthorityRolloutWindowVisualState(window: AuthorityRolloutWindow) {
  return {
    historyLabel: `histórico geral ${window.overall.sampleSize}`,
    postWindowLabel: `pós-safe-mapping ${window.postSafeMappingSampleSize}`,
    postWindowHint: window.postSafeMappingSampleSize > 0
      ? 'janela nova já consegue orientar a leitura atual'
      : 'janela pós-safe-mapping ainda insuficiente',
    postSafeMapping: {
      divergenceConfidenceLabel: `confiança marginal ${window.postSafeMapping?.divergenceByConfidenceMargin ?? 0}`,
    },
  }
}