import { buildBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

export type PublicEntitySignalType = 'viewed' | 'interacted' | 'exported' | 'shared' | 'followed'

export type PublicEntitySocialState = {
  entityId: string
  aggregate: {
    counts: Record<'viewed' | 'interacted' | 'exported' | 'shared' | 'followed', number>
    totalSignals: number
    engagementScore: number
    entityScore: number
    lastSignalAt?: string
  }
  viewerState: {
    followed: boolean
  }
}

export async function getEntitySocialState(entityId: string, baseUrl = getBackendBaseUrl()): Promise<PublicEntitySocialState | undefined> {
  try {
    const response = await fetch(`${baseUrl}/entity/${entityId}/signals`, {
      headers: await buildBackendAuthHeaders(),
    })

    if (!response.ok) {
      return undefined
    }

    const payload = await response.json() as {
      entityId?: string
      aggregate?: PublicEntitySocialState['aggregate']
      viewerState?: PublicEntitySocialState['viewerState']
    }

    if (!payload.entityId || !payload.aggregate) {
      return undefined
    }

    return {
      entityId: payload.entityId,
      aggregate: payload.aggregate,
      viewerState: payload.viewerState ?? { followed: false },
    }
  } catch {
    return undefined
  }
}

export async function registerEntitySignal(args: {
  entityId: string
  type: PublicEntitySignalType
  source?: string
  weight?: number
  metadata?: Record<string, string | number | boolean | null | undefined>
}, baseUrl = getBackendBaseUrl()) {
  try {
    await fetch(`${baseUrl}/entity/${args.entityId}/signals`, {
      method: 'POST',
      headers: await buildBackendAuthHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        type: args.type,
        source: args.source,
        weight: args.weight,
        metadata: args.metadata,
      }),
    })
  } catch {
    return
  }
}
