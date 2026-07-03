import { createHash } from 'node:crypto'

export const PUBLIC_TRIAGE_SPAM_POLICY = {
  ip: {
    maxAttempts: 10,
    windowMs: 10 * 60 * 1000,
    retryAfterSeconds: 10 * 60,
  },
  contact: {
    maxAttempts: 3,
    windowMs: 30 * 60 * 1000,
    retryAfterSeconds: 30 * 60,
  },
  office: {
    maxAttempts: 50,
    windowMs: 10 * 60 * 1000,
    retryAfterSeconds: 10 * 60,
  },
  invalidPayload: {
    maxAttempts: 5,
    windowMs: 10 * 60 * 1000,
    retryAfterSeconds: 10 * 60,
  },
} as const

export type PublicTriageSpamDecision = 'allow' | 'cooldown' | 'rate_limited' | 'blocked'

export type PublicTriageSpamEvaluation = {
  decision: PublicTriageSpamDecision
  reason: string
  retryAfterSeconds?: number
}

function normalizeKeyInput(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
}

export function hashPublicTriageIdentityKey(value: string | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }

  return createHash('sha256')
    .update(normalizeKeyInput(value), 'utf-8')
    .digest('hex')
}

export function resolvePublicTriageClientIp(args: {
  forwardedFor?: string
  cfConnectingIp?: string
  realIp?: string
  requestIp?: string
}) {
  const forwardedIp = args.forwardedFor
    ?.split(',')
    .map((part) => part.trim())
    .find(Boolean)

  return forwardedIp
    ?? args.cfConnectingIp?.trim()
    ?? args.realIp?.trim()
    ?? args.requestIp?.trim()
    ?? 'unknown'
}

export function evaluatePublicTriageSpamPolicy(args: {
  ipAttempts: number
  contactAttempts: number
  officeAttempts: number
}) : PublicTriageSpamEvaluation {
  if (args.contactAttempts >= PUBLIC_TRIAGE_SPAM_POLICY.contact.maxAttempts) {
    return {
      decision: 'cooldown',
      reason: 'contact_limit',
      retryAfterSeconds: PUBLIC_TRIAGE_SPAM_POLICY.contact.retryAfterSeconds,
    }
  }

  if (args.ipAttempts >= PUBLIC_TRIAGE_SPAM_POLICY.ip.maxAttempts) {
    return {
      decision: 'rate_limited',
      reason: 'ip_limit',
      retryAfterSeconds: PUBLIC_TRIAGE_SPAM_POLICY.ip.retryAfterSeconds,
    }
  }

  if (args.officeAttempts >= PUBLIC_TRIAGE_SPAM_POLICY.office.maxAttempts) {
    return {
      decision: 'rate_limited',
      reason: 'office_limit',
      retryAfterSeconds: PUBLIC_TRIAGE_SPAM_POLICY.office.retryAfterSeconds,
    }
  }

  return {
    decision: 'allow',
    reason: 'policy_clear',
  }
}

export function evaluateInvalidPayloadSpamPolicy(args: {
  invalidAttempts: number
}) : PublicTriageSpamEvaluation {
  if (args.invalidAttempts >= PUBLIC_TRIAGE_SPAM_POLICY.invalidPayload.maxAttempts) {
    return {
      decision: 'rate_limited',
      reason: 'invalid_payload_limit',
      retryAfterSeconds: PUBLIC_TRIAGE_SPAM_POLICY.invalidPayload.retryAfterSeconds,
    }
  }

  return {
    decision: 'allow',
    reason: 'invalid_payload_recorded',
  }
}
