import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type AssetStorageProvider = 'local' | string

export type AssetStorageConfig = {
  provider: AssetStorageProvider
  localDir: string
  publicBasePath: string
}

export type AssetStorageHealth = {
  ready: boolean
  provider?: string
  localDir?: string
  detail?: string
}

export type ExportAssetKind = 'original' | 'preview' | 'thumbnail' | 'avatar'

export type UploadExportAssetInput = {
  entityId: string
  exportId: string
  content: Buffer
  contentType?: string
  fileName?: string
  kind?: ExportAssetKind
}

export type UploadExportAssetResult = {
  key: string
  url: string
  contentType: string
  size: number
}

export type UploadExportAssetVariantsResult = {
  original: UploadExportAssetResult
  previewUrl: string
  thumbnailUrl?: string
}

export type ReadAssetResult = {
  key: string
  buffer: Buffer
  contentType: string
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return '/assets'
  }

  return trimmed.startsWith('/')
    ? trimmed.replace(/\/+$/, '')
    : `/${trimmed.replace(/\/+$/, '')}`
}

function slugifySegment(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'asset'
}

function inferExtension(contentType?: string, fileName?: string) {
  const explicitExtension = fileName?.split('.').pop()?.trim().toLowerCase()
  if (explicitExtension && explicitExtension !== fileName?.toLowerCase()) {
    return explicitExtension
  }

  if (!contentType) {
    return 'bin'
  }
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('svg')) return 'svg'
  if (contentType.includes('webm')) return 'webm'
  if (contentType.includes('mp4')) return 'mp4'
  return 'bin'
}

function inferContentType(key: string) {
  const extension = key.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'svg') return 'image/svg+xml'
  if (extension === 'webm') return 'video/webm'
  if (extension === 'mp4') return 'video/mp4'
  return 'application/octet-stream'
}

function isSafePublicUrl(url?: string) {
  if (!url) {
    return false
  }
  if (url.startsWith('/assets/')) {
    return true
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isImageContentType(contentType?: string) {
  return Boolean(contentType && contentType.startsWith('image/'))
}

export class AssetStorageService {
  constructor(private readonly config: AssetStorageConfig) {}

  getProvider() {
    return this.config.provider
  }

  getLocalFilePath(key: string) {
    return path.join(this.config.localDir, key)
  }

  getAssetUrl(key: string, baseUrl?: string) {
    const normalizedKey = key.replace(/^\/+/, '')
    if (baseUrl) {
      return `${baseUrl.replace(/\/+$/, '')}${this.config.publicBasePath}/${normalizedKey}`
    }
    return `${this.config.publicBasePath}/${normalizedKey}`
  }

  isSafePublicUrl(url?: string) {
    return isSafePublicUrl(url)
  }

  async healthCheck(): Promise<AssetStorageHealth> {
    if (this.config.provider !== 'local') {
      return {
        ready: false,
        provider: this.config.provider,
        detail: 'Remote provider not wired yet.',
      }
    }

    await mkdir(this.config.localDir, { recursive: true })
    return {
      ready: true,
      provider: this.config.provider,
      localDir: this.config.localDir,
    }
  }

  async uploadExportAsset(input: UploadExportAssetInput, baseUrl?: string): Promise<UploadExportAssetResult> {
    if (this.config.provider !== 'local') {
      throw new Error(`Storage provider "${this.config.provider}" is not wired yet.`)
    }

    const extension = inferExtension(input.contentType, input.fileName)
    const fileStem = slugifySegment(
      (input.fileName ?? `${input.exportId}-${input.kind ?? 'original'}`).replace(/\.[^.]+$/, ''),
    )
    const key = path.posix.join(
      'exports',
      slugifySegment(input.entityId),
      slugifySegment(input.exportId),
      `${slugifySegment(input.kind ?? 'original')}-${fileStem}.${extension}`,
    )
    const filePath = this.getLocalFilePath(key)

    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, input.content)

    return {
      key,
      url: this.getAssetUrl(key, baseUrl),
      contentType: input.contentType?.trim() || inferContentType(key),
      size: input.content.byteLength,
    }
  }

  async uploadExportAssetVariants(
    input: UploadExportAssetInput,
    baseUrl?: string,
  ): Promise<UploadExportAssetVariantsResult> {
    const original = await this.uploadExportAsset(input, baseUrl)
    if (!isImageContentType(original.contentType)) {
      return {
        original,
        previewUrl: original.url,
      }
    }

    const preview = await this.uploadExportAsset(
      {
        ...input,
        kind: 'preview',
        fileName: input.fileName,
      },
      baseUrl,
    )
    const thumbnail = await this.uploadExportAsset(
      {
        ...input,
        kind: 'thumbnail',
        fileName: input.fileName,
      },
      baseUrl,
    )

    return {
      original,
      previewUrl: preview.url,
      thumbnailUrl: thumbnail.url,
    }
  }

  async deleteAsset(key: string) {
    if (this.config.provider !== 'local') {
      return false
    }

    await rm(this.getLocalFilePath(key), { force: true })
    return true
  }

  async readAsset(key: string): Promise<ReadAssetResult | null> {
    if (this.config.provider !== 'local') {
      return null
    }

    try {
      const buffer = await readFile(this.getLocalFilePath(key))
      return {
        key,
        buffer,
        contentType: inferContentType(key),
      }
    } catch {
      return null
    }
  }
}

export function getAssetStorageConfig(rootDir: string): AssetStorageConfig {
  return {
    provider: process.env.ASSET_STORAGE_PROVIDER?.trim().toLowerCase() ?? 'local',
    localDir: process.env.ASSET_STORAGE_DIR?.trim() || path.join(rootDir, 'data', 'assets'),
    publicBasePath: normalizeBasePath(process.env.ASSET_PUBLIC_BASE_PATH ?? '/assets'),
  }
}

export function createAssetStorageService(config: AssetStorageConfig) {
  return new AssetStorageService(config)
}
