import { hashFlowMindValue } from '../../orchestrator/flowMindHashing.js'
import type {
  ExecutiveMemoryObservationFingerprintInput,
  ExecutiveMemoryObservationFromProjectionInput,
  ExecutiveMemoryObservationIdInput,
  ExecutiveMemoryObservationIdentity,
  ExecutiveMemoryObservationIdentityInput,
} from './ExecutiveMemoryTemporalIdentityTypes.js'
import { EXECUTIVE_MEMORY_OBSERVATION_IDENTITY_VERSION } from './ExecutiveMemoryTemporalIdentityTypes.js'

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory temporal identity requires ${label}.`)
  }
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Executive memory temporal identity requires ${label}.`)
  }
}

function validateIdentityInput(input: ExecutiveMemoryObservationIdentityInput) {
  assertPositiveInteger(input.projectionVersion, 'projectionVersion')
  assertPositiveInteger(input.tenantId, 'tenantId')
  assertNonEmptyString(input.officeId, 'officeId')
  assertNonEmptyString(input.captureCycleId, 'captureCycleId')
  assertNonEmptyString(input.contentFingerprint, 'contentFingerprint')
}

function buildObservationFingerprintValue(input: ExecutiveMemoryObservationFingerprintInput) {
  return {
    observationIdentityVersion: EXECUTIVE_MEMORY_OBSERVATION_IDENTITY_VERSION,
    projectionVersion: input.projectionVersion,
    tenantId: input.tenantId,
    officeId: input.officeId,
    captureCycleId: input.captureCycleId,
    contentFingerprint: input.contentFingerprint,
  }
}

export function buildExecutiveMemoryObservationIdentity(
  input: ExecutiveMemoryObservationIdentityInput,
): ExecutiveMemoryObservationIdentity {
  validateIdentityInput(input)

  return {
    projectionVersion: input.projectionVersion,
    tenantId: input.tenantId,
    officeId: input.officeId,
    captureCycleId: input.captureCycleId,
    contentFingerprint: input.contentFingerprint,
  }
}

export function buildExecutiveMemoryObservationIdentityFromProjection(
  input: ExecutiveMemoryObservationFromProjectionInput,
): ExecutiveMemoryObservationIdentity {
  return buildExecutiveMemoryObservationIdentity({
    projectionVersion: input.projection.projectionVersion,
    tenantId: input.projection.tenantId,
    officeId: input.projection.officeId,
    captureCycleId: input.captureCycleId,
    contentFingerprint: input.projection.contentFingerprint,
  })
}

export function buildExecutiveMemoryObservationFingerprint(
  input: ExecutiveMemoryObservationFingerprintInput,
) {
  const identity = buildExecutiveMemoryObservationIdentity(input)

  return hashFlowMindValue(buildObservationFingerprintValue(identity))
}

export function buildExecutiveMemoryObservationId(
  input: ExecutiveMemoryObservationIdInput,
) {
  const identity = buildExecutiveMemoryObservationIdentity(input)
  const observationFingerprint = buildExecutiveMemoryObservationFingerprint(identity)

  return `executive_memory_observation:${identity.tenantId}:${identity.officeId}:${observationFingerprint}`
}
