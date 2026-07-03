import {
  escapePrometheusLabelValue,
  sanitizePrometheusLabelName,
  sanitizePrometheusMetricName,
} from './prometheusEscape.js'
import type {
  PrometheusMetricType,
  PrometheusRenderInput,
  PrometheusTimingAggregate,
} from './prometheusTypes.js'

type ParsedMetricSeries = {
  metricName: string
  labels: Record<string, string>
}

type MetricFamily = {
  type: PrometheusMetricType
  series: Array<{
    labels: Record<string, string>
    value: number
  }>
}

function parseMetricSeriesKey(key: string): ParsedMetricSeries {
  const openBraceIndex = key.indexOf('{')
  const closeBraceIndex = key.endsWith('}') ? key.length - 1 : -1

  if (openBraceIndex === -1 || closeBraceIndex <= openBraceIndex) {
    return {
      metricName: key,
      labels: {},
    }
  }

  const metricName = key.slice(0, openBraceIndex)
  const serializedLabels = key.slice(openBraceIndex + 1, closeBraceIndex)
  if (!serializedLabels.trim()) {
    return {
      metricName,
      labels: {},
    }
  }

  const labels: Record<string, string> = {}
  for (const entry of serializedLabels.split(',')) {
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const labelName = entry.slice(0, separatorIndex).trim()
    const labelValue = entry.slice(separatorIndex + 1).trim()
    if (!labelName) {
      continue
    }

    labels[labelName] = labelValue
  }

  return {
    metricName,
    labels,
  }
}

function renderMetricLabels(labels: Record<string, string>) {
  const entries = Object.entries(labels)
    .map(([key, value]) => [sanitizePrometheusLabelName(key), value] as const)
    .sort(([left], [right]) => left.localeCompare(right))

  if (entries.length === 0) {
    return ''
  }

  const serialized = entries
    .map(([key, value]) => `${key}="${escapePrometheusLabelValue(value)}"`)
    .join(',')

  return `{${serialized}}`
}

function addMetricSeries(
  families: Map<string, MetricFamily>,
  name: string,
  type: PrometheusMetricType,
  labels: Record<string, string>,
  value: number,
) {
  const metricName = sanitizePrometheusMetricName(name)
  const family = families.get(metricName)

  if (family) {
    family.series.push({ labels, value })
    return
  }

  families.set(metricName, {
    type,
    series: [{ labels, value }],
  })
}

function normalizeTimingAggregate(metric: PrometheusTimingAggregate) {
  const count = metric.count
  const sum = metric.sum ?? metric.total ?? metric.totalMs ?? 0
  const avg = metric.avg ?? metric.avgMs ?? (count > 0 ? sum / count : 0)
  const max = metric.max ?? metric.maxMs ?? avg
  const min = metric.min ?? metric.minMs ?? avg

  return {
    count,
    sum,
    avg,
    min,
    max,
  }
}

function renderMetricFamily(name: string, family: MetricFamily) {
  const lines = [
    `# HELP ${name} Observability metric ${name}.`,
    `# TYPE ${name} ${family.type}`,
  ]

  const seriesLines = family.series
    .map(({ labels, value }) => `${name}${renderMetricLabels(labels)} ${value}`)
    .sort((left, right) => left.localeCompare(right))

  return [...lines, ...seriesLines]
}

export function renderPrometheusMetrics(snapshot: PrometheusRenderInput): string {
  const families = new Map<string, MetricFamily>()

  for (const [name, value] of Object.entries(snapshot.customCounters)) {
    addMetricSeries(families, name, 'counter', {}, value)
  }

  for (const [seriesKey, value] of Object.entries(snapshot.customCounterSeries)) {
    const parsed = parseMetricSeriesKey(seriesKey)
    addMetricSeries(families, parsed.metricName, 'counter', parsed.labels, value)
  }

  for (const [seriesKey, value] of Object.entries(snapshot.customGauges)) {
    const parsed = parseMetricSeriesKey(seriesKey)
    addMetricSeries(families, parsed.metricName, 'gauge', parsed.labels, value)
  }

  for (const [seriesKey, metric] of Object.entries(snapshot.customTimings)) {
    const parsed = parseMetricSeriesKey(seriesKey)
    const timing = normalizeTimingAggregate(metric)

    addMetricSeries(families, `${parsed.metricName}_count`, 'gauge', parsed.labels, timing.count)
    addMetricSeries(families, `${parsed.metricName}_sum`, 'gauge', parsed.labels, timing.sum)
    addMetricSeries(families, `${parsed.metricName}_avg`, 'gauge', parsed.labels, timing.avg)
    addMetricSeries(families, `${parsed.metricName}_min`, 'gauge', parsed.labels, timing.min)
    addMetricSeries(families, `${parsed.metricName}_max`, 'gauge', parsed.labels, timing.max)
  }

  const output = Array.from(families.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, family]) => renderMetricFamily(name, family))

  return output.length > 0 ? `${output.join('\n')}\n` : '\n'
}
