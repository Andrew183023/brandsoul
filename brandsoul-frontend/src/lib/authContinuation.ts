const AUTH_CONTINUATION_KEY = 'brandsoul.auth.continuation'

type PendingAdminAction = {
  type: 'open-admin-route'
  targetPath: string
  capturedAt: string
}

export type AuthContinuationContext = {
  returnTo: string
  intentLabel: string
  capturedAt: string
  pendingAction: PendingAdminAction
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function normalizePath(path: string) {
  const normalized = path.trim()
  if (!normalized.startsWith('/')) {
    return '/admin'
  }

  if (!normalized.startsWith('/admin')) {
    return '/admin'
  }

  return normalized
}

function isDirectOfficeAdminRoute(path: string) {
  return /^\/admin\/escritorios\/[^/]+(?:\/|$)/.test(path)
}

function safeDecodeRouteSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function resolveIntentLabel(path: string) {
  const officeMatch = path.match(/^\/admin\/escritorios\/([^/]+)/)
  if (officeMatch) {
    const officeId = safeDecodeRouteSegment(officeMatch[1] ?? '')
    return `Voce estava acessando o escritorio ${officeId}`
  }

  const caseMatch = path.match(/^\/admin\/cases\/([^/]+)/)
  if (caseMatch) {
    const caseId = safeDecodeRouteSegment(caseMatch[1] ?? '')
    return `Voce estava acessando o case ${caseId}`
  }

  return 'Voce estava acessando o ambiente administrativo'
}

function parseContinuation(raw: string | null): AuthContinuationContext | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthContinuationContext>
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    if (typeof parsed.returnTo !== 'string' || typeof parsed.intentLabel !== 'string' || typeof parsed.capturedAt !== 'string') {
      return null
    }

    if (!parsed.pendingAction || typeof parsed.pendingAction !== 'object') {
      return null
    }

    if (parsed.pendingAction.type !== 'open-admin-route' || typeof parsed.pendingAction.targetPath !== 'string' || typeof parsed.pendingAction.capturedAt !== 'string') {
      return null
    }

    return {
      returnTo: normalizePath(parsed.returnTo),
      intentLabel: parsed.intentLabel,
      capturedAt: parsed.capturedAt,
      pendingAction: {
        type: 'open-admin-route',
        targetPath: normalizePath(parsed.pendingAction.targetPath),
        capturedAt: parsed.pendingAction.capturedAt,
      },
    }
  } catch {
    return null
  }
}

export function captureAdminAuthContinuation(pathnameWithSearchAndHash: string) {
  if (!isBrowser()) {
    return
  }

  const returnTo = normalizePath(pathnameWithSearchAndHash)
  const context: AuthContinuationContext = {
    returnTo,
    intentLabel: resolveIntentLabel(returnTo),
    capturedAt: new Date().toISOString(),
    pendingAction: {
      type: 'open-admin-route',
      targetPath: returnTo,
      capturedAt: new Date().toISOString(),
    },
  }

  window.sessionStorage.setItem(AUTH_CONTINUATION_KEY, JSON.stringify(context))
}

export function readAuthContinuationContext() {
  if (!isBrowser()) {
    return null
  }

  return parseContinuation(window.sessionStorage.getItem(AUTH_CONTINUATION_KEY))
}

export function clearAuthContinuationContext() {
  if (!isBrowser()) {
    return
  }

  window.sessionStorage.removeItem(AUTH_CONTINUATION_KEY)
}

export function consumeAuthContinuationReturnTo(defaultPath = '/admin') {
  const context = readAuthContinuationContext()
  if (!context) {
    return defaultPath
  }

  clearAuthContinuationContext()
  return context.returnTo
}

export function consumeSafeLegalAdminContinuationReturnTo(defaultPath = '/admin') {
  const context = readAuthContinuationContext()
  if (!context) {
    return defaultPath
  }

  clearAuthContinuationContext()

  if (isDirectOfficeAdminRoute(context.returnTo)) {
    return defaultPath
  }

  return context.returnTo
}
