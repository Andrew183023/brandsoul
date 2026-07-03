export function escapePrometheusLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"')
}

export function sanitizePrometheusMetricName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_:]/g, '_')
}

export function sanitizePrometheusLabelName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_')
  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `_${sanitized}`
}
