import { SigningKeyService } from './signingKeyService.js'
import { TokenService } from './tokenService.js'

export class JwksService {
  constructor(
    private readonly signingKeyService: SigningKeyService,
    private readonly tokenService: TokenService,
  ) {}

  async getJwks() {
    const keys = await this.signingKeyService.getPublicKeysForValidation()
    return {
      keys: await Promise.all(keys.map((key) => this.tokenService.buildPublicJwk(key))),
    }
  }
}

export function createJwksService(signingKeyService: SigningKeyService, tokenService: TokenService) {
  return new JwksService(signingKeyService, tokenService)
}