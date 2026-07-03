import type { ObservabilityService } from '../../services/observabilityService.js'

import { assertLegalMetricIsRegistered } from './legalOperationalMetricsRegistry.js'

export class LegalMetricsRecorder {
  constructor(
    private readonly observability: ObservabilityService,
  ) {}

  increment(metricName: string, labels?: Record<string, string>) {
    const metric = assertLegalMetricIsRegistered(metricName)
    if (metric.type !== 'counter') {
      throw new Error(`Metric "${metricName}" is not a counter.`)
    }

    this.observability.incrementMetric(metricName, 1, labels)
  }

  incrementCounter(metricName: string, labels?: Record<string, string>) {
    this.increment(metricName, labels)
  }

  setGauge(metricName: string, value: number, labels?: Record<string, string>) {
    const metric = assertLegalMetricIsRegistered(metricName)
    if (metric.type !== 'gauge') {
      throw new Error(`Metric "${metricName}" is not a gauge.`)
    }

    this.observability.setGauge(metricName, value, labels)
  }

  setGaugeMetric(metricName: string, value: number, labels?: Record<string, string>) {
    this.setGauge(metricName, value, labels)
  }

  recordTiming(metricName: string, durationMs: number, labels?: Record<string, string>) {
    const metric = assertLegalMetricIsRegistered(metricName)
    if (metric.type !== 'timing') {
      throw new Error(`Metric "${metricName}" is not a timing.`)
    }

    this.observability.recordTiming(metricName, durationMs, labels)
  }

  recordMetricTiming(metricName: string, durationMs: number, labels?: Record<string, string>) {
    this.recordTiming(metricName, durationMs, labels)
  }
}
