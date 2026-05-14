export type AuthErrorCode =
  | 'invalid_credentials'
  | 'tenant_selection_required'
  | 'invalid_registration'
  | 'email_already_registered'
  | 'invalid_token'
  | 'invalid_refresh_token'
  | 'invalid_reset_token'
  | 'refresh_expired'
  | 'refresh_reuse_detected'
  | 'session_revoked'
  | 'signing_key_unavailable'
  | 'auth_not_configured'
  | 'insufficient_claims'

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly statusCode: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AuthError'
  }

  static invalidCredentials() {
    return new AuthError('invalid_credentials', 401, 'Invalid credentials.')
  }

  static tenantSelectionRequired(details?: Record<string, unknown>) {
    return new AuthError('tenant_selection_required', 409, 'Tenant selection is required for multi-tenant accounts.', details)
  }

  static invalidRegistration(message = 'Invalid registration payload.') {
    return new AuthError('invalid_registration', 400, message)
  }

  static emailAlreadyRegistered() {
    return new AuthError('email_already_registered', 409, 'Email already registered.')
  }

  static invalidToken(message = 'Invalid authentication token.') {
    return new AuthError('invalid_token', 401, message)
  }

  static invalidRefreshToken() {
    return new AuthError('invalid_refresh_token', 401, 'Invalid refresh token.')
  }

  static invalidResetToken() {
    return new AuthError('invalid_reset_token', 400, 'Invalid reset token.')
  }

  static refreshExpired() {
    return new AuthError('refresh_expired', 401, 'Refresh token expired.')
  }

  static refreshReuseDetected() {
    return new AuthError('refresh_reuse_detected', 401, 'Refresh token reuse detected.')
  }

  static sessionRevoked() {
    return new AuthError('session_revoked', 401, 'Session revoked.')
  }

  static signingKeyUnavailable() {
    return new AuthError('signing_key_unavailable', 503, 'Signing key unavailable.')
  }

  static authNotConfigured() {
    return new AuthError('auth_not_configured', 503, 'Authentication authority is not configured.')
  }

  static insufficientClaims(message = 'Authentication token is missing required claims.') {
    return new AuthError('insufficient_claims', 401, message)
  }
}

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError
}

export function toAuthErrorResponse(error: AuthError) {
  return {
    status: 'failed' as const,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  }
}
