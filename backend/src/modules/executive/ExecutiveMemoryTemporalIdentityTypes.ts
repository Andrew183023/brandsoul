import type { ExecutiveMemoryProjection } from './ExecutiveMemoryProjectionTypes.js'

export const EXECUTIVE_MEMORY_OBSERVATION_IDENTITY_VERSION = 1 as const

export interface ExecutiveMemoryObservationIdentityInput {
  projectionVersion: number
  tenantId: number
  officeId: string
  captureCycleId: string
  contentFingerprint: string
}

export interface ExecutiveMemoryObservationIdentity
extends ExecutiveMemoryObservationIdentityInput {}

export interface ExecutiveMemoryObservationFingerprintInput
extends ExecutiveMemoryObservationIdentityInput {}

export interface ExecutiveMemoryObservationIdInput
extends ExecutiveMemoryObservationIdentityInput {}

export interface ExecutiveMemoryObservationFromProjectionInput {
  projection: Pick<ExecutiveMemoryProjection, 'projectionVersion' | 'tenantId' | 'officeId' | 'contentFingerprint'>
  captureCycleId: string
}
