export type PrometheusMetricType = 'counter' | 'gauge'

export type PrometheusTimingAggregate = {
  count: number
  sum?: number
  total?: number
  totalMs?: number
  min?: number
  minMs?: number
  max?: number
  maxMs?: number
  avg?: number
  avgMs?: number
}

export interface PrometheusRenderInput {
  customCounters: Record<string, number>
  customCounterSeries: Record<string, number>
  customGauges: Record<string, number>
  customTimings: Record<string, PrometheusTimingAggregate>
}
