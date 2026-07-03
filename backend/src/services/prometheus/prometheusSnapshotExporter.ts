import type { PrometheusRenderInput } from './prometheusTypes.js'
import { renderPrometheusMetrics } from './prometheusRenderer.js'

export function exportObservabilitySnapshotToPrometheus(snapshot: PrometheusRenderInput): string {
  return renderPrometheusMetrics(snapshot)
}
