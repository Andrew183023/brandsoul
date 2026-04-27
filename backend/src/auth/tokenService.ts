import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import bcrypt from 'bcryptjs'
import { SignJWT, decodeProtectedHeader, exportJWK, importPKCS8, importSPKI, jwtVerify } from 'jose'

import type { AuthConfig } from './authConfig.js'
import { AuthError } from './authErrors.js'
import type { AccessTokenPayload, AuthContext, AuthPrincipal, SigningKeyRecord } from './authTypes.js'
import { SigningKeyService } from './signingKeyService.js'

type IssueAccessTokenArgs = {
  principal: AuthPrincipal
  signingKey: SigningKeyRecord
  sessionId?: string
}

type IssueAccessTokenResult = {
  token: string
  payload: AccessTokenPayload
}

function parseIntegerIdentifier(value: string, fieldName: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw AuthError.insufficientClaims(`${fieldName} must be a positive integer string.`)
  }

  return parsed
}

function normalizeRoles(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw AuthError.insufficientClaims('roles must be a non-empty array of strings.')
  }

  return value.map((role) => role.trim().toLowerCase())
}

function parseBcryptSha256Hash(hash: string) {
  const versionTwoMatch = hash.match(/^\$bcrypt-sha256\$v=(\d+),t=(2b),r=(\d{1,2})\$([^$]{22})\$([^$]{31})$/)
  if (versionTwoMatch) {
    return {
      version: Number(versionTwoMatch[1]),
      ident: versionTwoMatch[2],
      rounds: Number(versionTwoMatch[3]),
      salt: versionTwoMatch[4],
      digest: versionTwoMatch[5],
    }
  }

  const versionOneMatch = hash.match(/^\$bcrypt-sha256\$(2[ab]),(\d{1,2})\$([^$]{22})\$([^$]{31})$/)
  if (versionOneMatch) {
    return {
      version: 1,
      ident: versionOneMatch[1],
      rounds: Number(versionOneMatch[2]),
      salt: versionOneMatch[3],
      digest: versionOneMatch[4],
    }
  }

  return null
}

export function verifyPassword(password: string, passwordHash: string) {
  if (!passwordHash) {
    return false
  }

  if (passwordHash.startsWith('$bcrypt-sha256$')) {
    const parsed = parseBcryptSha256Hash(passwordHash)
    if (!parsed) {
      return false
    }

    const secretBytes = Buffer.from(password, 'utf-8')
    const digest = parsed.version === 1
      ? createHash('sha256').update(secretBytes).digest()
      : createHmac('sha256', parsed.salt).update(secretBytes).digest()
    const bcryptSecret = digest.toString('base64')
    const bcryptHash = `$${parsed.ident}$${String(parsed.rounds).padStart(2, '0')}$${parsed.salt}${parsed.digest}`
    return bcrypt.compareSync(bcryptSecret, bcryptHash)
  }

  if (passwordHash.startsWith('$2')) {
    return bcrypt.compareSync(password, passwordHash)
  }

  const [encodedSalt, encodedHash] = passwordHash.split('$', 2)
  if (!encodedSalt || !encodedHash) {
    return false
  }

  try {
    const salt = Buffer.from(encodedSalt, 'base64')
    const expectedHash = Buffer.from(encodedHash, 'base64')
    const directSha = createHash('sha256')
      .update(Buffer.concat([Buffer.from(password, 'utf-8'), salt]))
      .digest()
    if (directSha.equals(expectedHash)) {
      return true
    }

    const pbkdf2Hash = pbkdf2Sync(password, salt, 120_000, expectedHash.length, 'sha256')
    return pbkdf2Hash.equals(expectedHash)
  } catch {
    return false
  }
}

function validateJwtClaims(payload: Record<string, unknown>, token: string): AuthContext {
  const subject = typeof payload.sub === 'string' ? payload.sub : ''
  const tenantIdValue = typeof payload.tenant_id === 'string' ? payload.tenant_id : String(payload.tenant_id ?? '')
  const issuer = typeof payload.iss === 'string' ? payload.iss : ''
  const audience = Array.isArray(payload.aud)
    ? payload.aud[0]
    : (typeof payload.aud === 'string' ? payload.aud : '')
  const version = Number(payload.ver)
  const issuedAt = Number(payload.iat)
  const expiresAt = Number(payload.exp)
  const jti = typeof payload.jti === 'string' ? payload.jti : ''
  const sessionId = typeof payload.sid === 'string' ? payload.sid : undefined
  const roles = normalizeRoles(payload.roles)

  if (!subject || !tenantIdValue || !issuer || !audience || !Number.isInteger(version) || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !jti) {
    throw AuthError.insufficientClaims()
  }

  return {
    token,
    subject,
    userId: parseIntegerIdentifier(subject, 'sub'),
    tenantId: parseIntegerIdentifier(tenantIdValue, 'tenant_id'),
    roles,
    version,
    issuer,
    audience,
    jti,
    issuedAt,
    expiresAt,
    sessionId,
  }
}

export class TokenService {
  constructor(
    private readonly config: AuthConfig,
    private readonly signingKeyService: SigningKeyService,
  ) {}

  getAccessTokenTtlSeconds() {
    return this.config.accessTokenTtlSeconds
  }

  generateOpaqueRefreshToken() {
    return randomBytes(32).toString('base64url')
  }

  hashOpaqueToken(token: string) {
    return createHash('sha256').update(token, 'utf-8').digest('hex')
  }

  fingerprintOpaqueToken(token: string) {
    return createHash('sha256').update(`fingerprint:${token}`, 'utf-8').digest('hex').slice(0, 32)
  }

  async issueAccessToken(args: IssueAccessTokenArgs): Promise<IssueAccessTokenResult> {
    const issuedAt = Math.floor(Date.now() / 1000)
    const expiresAt = issuedAt + this.config.accessTokenTtlSeconds
    const payload: AccessTokenPayload = {
      iss: this.config.issuer,
      aud: this.config.audience,
      sub: String(args.principal.user.id),
      tenant_id: String(args.principal.tenant.id),
      roles: args.principal.roles,
      ver: 1,
      iat: issuedAt,
      exp: expiresAt,
      jti: randomBytes(16).toString('hex'),
      ...(args.sessionId ? { sid: args.sessionId } : {}),
    }

    const privateKeyPem = await readFile(args.signingKey.privateKeyRef, 'utf-8')
    const privateKey = await importPKCS8(privateKeyPem, 'RS256')
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: args.signingKey.kid })
      .sign(privateKey)

    return {
      token,
      payload,
    }
  }

  async verifyAccessToken(token: string): Promise<AuthContext> {
    const protectedHeader = decodeProtectedHeader(token)

    if (protectedHeader.alg !== 'RS256') {
      throw AuthError.invalidToken('Unsupported token algorithm.')
    }

    if (!protectedHeader.kid || typeof protectedHeader.kid !== 'string') {
      throw AuthError.invalidToken('Token header is missing kid.')
    }

    const signingKey = await this.signingKeyService.getValidationKeyByKid(protectedHeader.kid)
    if (!signingKey) {
      throw AuthError.invalidToken('Unknown signing key.')
    }

    const publicKey = await importSPKI(signingKey.publicKeyPem, 'RS256')
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithms: ['RS256'],
      clockTolerance: this.config.clockToleranceSeconds,
    })

    return validateJwtClaims(payload as Record<string, unknown>, token)
  }

  async buildPublicJwk(signingKey: SigningKeyRecord) {
    const publicKey = await importSPKI(signingKey.publicKeyPem, 'RS256')
    const jwk = await exportJWK(publicKey)

    return {
      ...jwk,
      kid: signingKey.kid,
      alg: signingKey.algorithm,
      use: 'sig',
    }
  }
}

export function createTokenService(config: AuthConfig, signingKeyService: SigningKeyService) {
  return new TokenService(config, signingKeyService)
}