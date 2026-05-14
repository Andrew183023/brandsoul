import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

import type { ObservabilityService } from '../src/services/observabilityService.js'

export const HERMETIC_NETWORK_VIOLATION = 'HERMETIC_NETWORK_VIOLATION'

type NetworkGuardOptions = {
  allowHosts?: string[]
  observability?: ObservabilityService
}

function parseAllowHosts(rawValue: string | undefined) {
  const hosts = (rawValue ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  if (hosts.length > 0) {
    return new Set(hosts)
  }

  return new Set(['localhost', '127.0.0.1', '::1'])
}

function toHost(input: string) {
  try {
    return new URL(input).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function extractHttpTarget(args: unknown[]) {
  const [input] = args

  if (typeof input === 'string') {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>
    const protocol = typeof record.protocol === 'string' ? record.protocol : 'http:'
    const host = typeof record.hostname === 'string'
      ? record.hostname
      : typeof record.host === 'string'
        ? record.host
        : 'unknown-host'
    const port = typeof record.port === 'number' || typeof record.port === 'string' ? `:${String(record.port)}` : ''
    const pathname = typeof record.path === 'string' ? record.path : '/'
    return `${protocol}//${host}${port}${pathname}`
  }

  return 'unknown://unknown-host'
}

function toViolationError(endpoint: string) {
  const error = new Error(`[hermetic-network-guard] outbound network request blocked: ${endpoint}`) as Error & { code?: string }
  error.code = HERMETIC_NETWORK_VIOLATION
  return error
}

export function installTestNetworkGuard(options: NetworkGuardOptions = {}) {
  const globalState = globalThis as typeof globalThis & { __brandsoulNetworkGuardInstalled?: boolean }
  if (globalState.__brandsoulNetworkGuardInstalled) {
    return
  }

  const allowHosts = new Set((options.allowHosts ?? []).map((host) => host.toLowerCase()))
  for (const host of parseAllowHosts(process.env.HERMETIC_NETWORK_ALLOWLIST)) {
    allowHosts.add(host)
  }

  const observability = options.observability

  function shouldBlock(endpoint: string) {
    const host = toHost(endpoint)
    if (!host) {
      return true
    }

    return !allowHosts.has(host)
  }

  function handleBlocked(endpoint: string): never {
    observability?.incrementMetric('blocked_network_attempt_total', 1, {
      endpoint,
    })
    console.error(`[hermetic-network-guard] blocked outbound endpoint=${endpoint}`)
    throw toViolationError(endpoint)
  }

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const endpoint = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : typeof input === 'object' && input !== null && 'url' in input
          ? String((input as { url: unknown }).url)
          : 'unknown://unknown-host'
    if (shouldBlock(endpoint)) {
      handleBlocked(endpoint)
    }

    if (!originalFetch) {
      throw new Error('fetch is not available in this runtime')
    }

    return originalFetch(input as Parameters<typeof fetch>[0], init)
  }) as typeof globalThis.fetch

  const originalHttpRequest = http.request.bind(http)
  const originalHttpGet = http.get.bind(http)
  const originalHttpsRequest = https.request.bind(https)
  const originalHttpsGet = https.get.bind(https)

  http.request = ((...args: unknown[]) => {
    const endpoint = extractHttpTarget(args)
    if (shouldBlock(endpoint)) {
      handleBlocked(endpoint)
    }

    return originalHttpRequest(...(args as Parameters<typeof http.request>))
  }) as typeof http.request

  http.get = ((...args: unknown[]) => {
    const endpoint = extractHttpTarget(args)
    if (shouldBlock(endpoint)) {
      handleBlocked(endpoint)
    }

    return originalHttpGet(...(args as Parameters<typeof http.get>))
  }) as typeof http.get

  https.request = ((...args: unknown[]) => {
    const endpoint = extractHttpTarget(args)
    if (shouldBlock(endpoint)) {
      handleBlocked(endpoint)
    }

    return originalHttpsRequest(...(args as Parameters<typeof https.request>))
  }) as typeof https.request

  https.get = ((...args: unknown[]) => {
    const endpoint = extractHttpTarget(args)
    if (shouldBlock(endpoint)) {
      handleBlocked(endpoint)
    }

    return originalHttpsGet(...(args as Parameters<typeof https.get>))
  }) as typeof https.get

  globalState.__brandsoulNetworkGuardInstalled = true
}
