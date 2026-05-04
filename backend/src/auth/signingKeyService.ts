import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import type { AuthConfig } from './authConfig.js'
import { AuthError } from './authErrors.js'
import type { SigningKeyRecord } from './authTypes.js'
import { SigningKeyRepository } from './repositories/signingKeyRepository.js'

export class SigningKeyService {
  constructor(
    private readonly repository: SigningKeyRepository,
    private readonly config: AuthConfig,
  ) {}

  isConfigured() {
    return Boolean(
      this.config.configuredKid
      && this.config.configuredPrivateKeyRef
      && this.config.configuredPublicKeyPath,
    )
  }

  async syncConfiguredKey() {
    if (!this.isConfigured()) {
      return null
    }

    const publicKeyPem = await readFile(this.config.configuredPublicKeyPath, 'utf-8')
    const now = new Date().toISOString()

    return this.repository.upsertConfiguredKey({
      id: randomUUID(),
      kid: this.config.configuredKid,
      algorithm: 'RS256',
      status: 'active',
      publicKeyPem,
      privateKeyRef: this.config.configuredPrivateKeyRef,
      notBefore: now,
      activatesAt: now,
      createdBy: 'backend-auth-authority',
      rotationReason: 'configured-active-key',
    })
  }

  async getActiveSigningKey() {
    const key = await this.repository.getActiveKey(new Date().toISOString())
    if (!key) {
      throw AuthError.signingKeyUnavailable()
    }

    return key
  }

  async getValidationKeyByKid(kid: string) {
    const key = await this.repository.findByKid(kid)
    if (!key || !['active', 'verifying'].includes(key.status)) {
      return null
    }

    return key
  }

  async getPublicKeysForValidation() {
    return this.repository.listValidationKeys(new Date().toISOString())
  }

  async incrementIssuedTokenCount(key: SigningKeyRecord) {
    await this.repository.incrementIssuedTokenCount(key.id)
  }
}

export function createSigningKeyService(repository: SigningKeyRepository, config: AuthConfig) {
  return new SigningKeyService(repository, config)
}