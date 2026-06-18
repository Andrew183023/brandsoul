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

export type PublicOfficeSocialState = PublicEntitySocialState

function buildEmptySocialState(entityId: string): PublicEntitySocialState {
  return {
    entityId,
    aggregate: {
      counts: {
        viewed: 0,
        interacted: 0,
        exported: 0,
        shared: 0,
        followed: 0,
      },
      totalSignals: 0,
      engagementScore: 0,
      entityScore: 0,
    },
    viewerState: {
      followed: false,
    },
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

export async function getOfficeSocialState(officeId: string) {
  return buildEmptySocialState(officeId)
}

export async function registerOfficeSignal(_args: {
  officeId: string
  type: PublicEntitySignalType
  source?: string
  weight?: number
  metadata?: Record<string, string | number | boolean | null | undefined>
}) {
  return
}
