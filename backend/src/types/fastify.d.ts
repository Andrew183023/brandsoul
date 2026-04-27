import type { StoredEntityProfile } from '../domain/entityProfile.js'
import type { AuthContext } from '../auth/authTypes.js'
import type { EntityOwnershipValidation } from '../api/middleware/requireEntityOwner.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext
    entityRecord?: StoredEntityProfile
    entityOwnership?: EntityOwnershipValidation
    traceId?: string
    observabilityStartedAt?: number
  }
}
