import { buildBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'

export type LogEntityExportInput = {
  entityId: string
  format: string
  metadata?: Record<string, string | number | boolean | null | undefined>
  fileUrl?: string
  assetBlob?: Blob
  fileName?: string
  contentType?: string
  assetKind?: 'original' | 'preview' | 'thumbnail' | 'avatar'
}

export type LoggedEntityExport = {
  id: string
  entityId: string
  format: string
  createdAt: string
  metadata: Record<string, string | number | boolean | null | undefined>
  fileUrl?: string
}

export type RegisterEntitySignalInput = {
  entityId: string
  type: 'viewed' | 'interacted' | 'exported' | 'shared' | 'followed'
  source?: string
  weight?: number
  metadata?: Record<string, string | number | boolean | null | undefined>
}

export type PublicEntityExportPayload = {
  entityId: string
  export: LoggedEntityExport
  publicLink: string
  entityLink: string
}

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function parseDataUrl(value?: string) {
  if (!value?.startsWith('data:')) {
    return null
  }

  const match = value.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) {
    return null
  }

  return {
    contentType: match[1],
    assetBase64: match[2],
  }
}

export type EntityExportApi = {
  logExport(input: LogEntityExportInput): Promise<PublicEntityExportPayload | undefined>
  registerSignal(input: RegisterEntitySignalInput): Promise<void>
  getPublicExport(entityId: string, exportId: string): Promise<PublicEntityExportPayload | undefined>
  getEntityExport(entityId: string, exportId: string): Promise<PublicEntityExportPayload | undefined>
}

export function createHttpEntityExportApi(baseUrl = getBackendBaseUrl()): EntityExportApi {
  return {
    async logExport(input) {
      const assetFromBlob = input.assetBlob
        ? {
            assetBase64: await blobToBase64(input.assetBlob),
            contentType: input.contentType ?? (input.assetBlob.type || undefined),
          }
        : null
      const assetFromDataUrl = !assetFromBlob ? parseDataUrl(input.fileUrl) : null

      const response = await fetch(`${baseUrl}/entity/${input.entityId}/exports`, {
        method: 'POST',
        headers: await buildBackendAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          format: input.format,
          metadata: input.metadata,
          fileUrl: input.fileUrl && !input.fileUrl.startsWith('data:') ? input.fileUrl : undefined,
          assetBase64: assetFromBlob?.assetBase64 ?? assetFromDataUrl?.assetBase64,
          contentType: assetFromBlob?.contentType ?? assetFromDataUrl?.contentType ?? input.contentType,
          fileName: input.fileName,
          assetKind: input.assetKind,
        }),
      }).catch(() => undefined)
      if (!response?.ok) {
        return undefined
      }

      const payload = await response.json() as {
        export?: LoggedEntityExport
        entityId?: string
        publicLink?: string
        entityLink?: string
      }

      if (!payload.export || !payload.entityId || !payload.publicLink || !payload.entityLink) {
        return undefined
      }

      return {
        entityId: payload.entityId,
        export: payload.export,
        publicLink: payload.publicLink,
        entityLink: payload.entityLink,
      }
    },
    async registerSignal(input) {
      await fetch(`${baseUrl}/entity/${input.entityId}/signals`, {
        method: 'POST',
        headers: await buildBackendAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          type: input.type,
          source: input.source,
          weight: input.weight,
          metadata: input.metadata,
        }),
      }).catch(() => undefined)
    },
    async getPublicExport(entityId, exportId) {
      const response = await fetch(`${baseUrl}/entity/${entityId}/export/${exportId}`).catch(() => undefined)
      if (!response?.ok) {
        return undefined
      }

      const payload = await response.json() as {
        entityId?: string
        export?: LoggedEntityExport
        publicLink?: string
        entityLink?: string
      }

      if (!payload.export || !payload.entityId || !payload.publicLink || !payload.entityLink) {
        return undefined
      }

      return {
        entityId: payload.entityId,
        export: payload.export,
        publicLink: payload.publicLink,
        entityLink: payload.entityLink,
      }
    },
    async getEntityExport(entityId, exportId) {
      return this.getPublicExport(entityId, exportId)
    },
  }
}
