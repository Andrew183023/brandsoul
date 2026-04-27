import type { BackendEntityRequest } from '../contracts/BackendEntityRequest'
import type { BackendEntityResponse } from '../contracts/BackendEntityResponse'
import { processBrand } from '../../domain/entity/engine/processBrand'
import { buildBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'
import { clearSession, getAuthToken } from '../../lib/session'

export type PersonaEngineApi = {
  createEntity(request: BackendEntityRequest): Promise<BackendEntityResponse>
  getEntityById(entityId: string): Promise<BackendEntityResponse | undefined>
  getMyEntities(): Promise<BackendEntityResponse[]>
  // Transitional alias while legacy callers are removed.
  getEntitiesByOwnerId(ownerId: string): Promise<BackendEntityResponse[]>
}

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

function normalizeResponse(response: Partial<BackendEntityResponse> & { entityId?: string; entity?: BackendEntityResponse['entity'] }): BackendEntityResponse {
  return {
    entityId: response.entityId ?? response.entity?.id ?? '',
    requestId: response.requestId ?? '',
    schemaVersion: 1,
    status: response.status ?? (response.entity ? 'ready' : 'failed'),
    entity: response.entity,
    error: response.error,
  }
}

export function processBrandIntoEntity(request: BackendEntityRequest): BackendEntityResponse {
  try {
    const entity = processBrand(request.entityInput, {
      intensity: request.manifestation?.intensity,
      runtimeControl: request.runtimeControl,
      requestId: request.requestId,
      source: 'backend-engine',
    })

    return {
      entityId: entity.id,
      requestId: request.requestId,
      schemaVersion: 1,
      status: 'ready',
      entity,
    }
  } catch (error) {
    return {
      entityId: '',
      requestId: request.requestId,
      schemaVersion: 1,
      status: 'failed',
      error: {
        code: 'ENTITY_INPUT_INCOMPLETE',
        message: error instanceof Error ? error.message : 'Unable to create an entity profile from the provided brand input.',
      },
    }
  }
}

export function createMockPersonaEngineApi(): PersonaEngineApi {
  return {
    async createEntity(request) {
      return processBrandIntoEntity(request)
    },
    async getEntityById() {
      return undefined
    },
    async getMyEntities() {
      return []
    },
    async getEntitiesByOwnerId() {
      return []
    },
  }
}

export function createHttpPersonaEngineApi(baseUrl = getBackendBaseUrl()): PersonaEngineApi {
  let inflightMyEntitiesRequest: Promise<BackendEntityResponse[]> | null = null

  return {
    async createEntity(request) {
      const response = await fetch(`${baseUrl}/entity/create`, {
        method: 'POST',
        headers: await buildBackendAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          requestId: request.requestId,
          ownerId: request.ownerId,
          entityInput: request.entityInput,
          manifestation: request.manifestation,
          runtimeControl: request.runtimeControl,
        }),
      })

      const payload = (await response.json()) as Partial<BackendEntityResponse>
      return normalizeResponse(payload)
    },
    async getEntityById(entityId) {
      if (!getAuthToken()) {
        return undefined
      }

      const response = await fetch(`${baseUrl}/entity/${entityId}`, {
        headers: await buildBackendAuthHeaders(),
      })
      if (response.status === 401) {
        clearSession()
        return undefined
      }
      if (response.status === 404) {
        return undefined
      }

      const payload = (await response.json()) as Partial<BackendEntityResponse>
      return normalizeResponse(payload)
    },
    async getMyEntities() {
      if (!getAuthToken()) {
        return []
      }

      if (inflightMyEntitiesRequest) {
        return inflightMyEntitiesRequest
      }

      inflightMyEntitiesRequest = (async () => {
        const response = await fetch(`${baseUrl}/me/entities`, {
          headers: await buildBackendAuthHeaders(),
        })
        if (response.status === 401) {
          clearSession()
          return []
        }
        const payload = (await response.json()) as { entities?: Array<Partial<BackendEntityResponse>> }

        return (payload.entities ?? []).map((entityResponse) => normalizeResponse(entityResponse))
      })()

      try {
        return await inflightMyEntitiesRequest
      } finally {
        inflightMyEntitiesRequest = null
      }
    },
    async getEntitiesByOwnerId(_ownerId) {
      return this.getMyEntities()
    },
  }
}

export function createHybridPersonaEngineApi(baseUrl = getBackendBaseUrl()): PersonaEngineApi {
  const httpApi = createHttpPersonaEngineApi(baseUrl)
  const mockApi = createMockPersonaEngineApi()

  return {
    async createEntity(request) {
      try {
        return await httpApi.createEntity(request)
      } catch {
        return mockApi.createEntity(request)
      }
    },
    async getEntityById(entityId) {
      try {
        return await httpApi.getEntityById(entityId)
      } catch {
        return mockApi.getEntityById(entityId)
      }
    },
    async getMyEntities() {
      try {
        return await httpApi.getMyEntities()
      } catch {
        return mockApi.getMyEntities()
      }
    },
    async getEntitiesByOwnerId(ownerId) {
      try {
        return await httpApi.getEntitiesByOwnerId(ownerId)
      } catch {
        return mockApi.getEntitiesByOwnerId(ownerId)
      }
    },
  }
}

export function createUnavailablePersonaEngineApi(): PersonaEngineApi {
  return {
    async createEntity() {
      throw new Error('Persona engine backend is not connected yet.')
    },
    async getEntityById() {
      return undefined
    },
    async getMyEntities() {
      return []
    },
    async getEntitiesByOwnerId() {
      return []
    },
  }
}
