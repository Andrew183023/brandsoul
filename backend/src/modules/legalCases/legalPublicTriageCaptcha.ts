export type CaptchaVerificationContext = {
  tenantId: number
  entityId: string
  requestId: string
  source: 'public_triage'
}

export type CaptchaVerificationResult = {
  ok: true
  status: 'passed' | 'skipped'
} | {
  ok: false
  status: 'blocked'
  reason: string
  retryAfterSeconds?: number
}

export type CaptchaVerificationProvider = {
  verify(token: string | undefined, context: CaptchaVerificationContext): Promise<CaptchaVerificationResult>
}

export function createNoopCaptchaVerificationProvider(): CaptchaVerificationProvider {
  return {
    async verify() {
      return {
        ok: true,
        status: 'skipped',
      }
    },
  }
}
