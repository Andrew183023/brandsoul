import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'

export type AssetStorageProvider = 'local' | string

export type AssetStorageConfig = {
  provider: AssetStorageProvider
  localDir: string
  publicBasePath: string
  publicBaseUrl?: string
  bucket?: string
  region?: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
  forcePathStyle?: boolean
}

export type AssetStorageHealth = {
  ready: boolean
  status: 'ready' | 'degraded' | 'failed'
  provider?: string
  localDir?: string
  detail?: string
  warning?: string
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

function shouldUseRemoteStorage(provider: AssetStorageProvider) {
  return provider === 'r2' || provider === 's3'
}

function trimOptionalEnv(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeRemoteAssetEndpoint(provider: AssetStorageProvider, endpoint: string | undefined) {
  const trimmedEndpoint = trimOptionalEnv(endpoint)
  if (!trimmedEndpoint) {
    return undefined
  }

  let parsed: URL
  try {
    parsed = new URL(trimmedEndpoint)
  } catch {
    throw new Error(`Invalid asset storage endpoint for provider "${provider}".`)
  }

  if ((provider === 'r2' || provider === 's3') && parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`ASSET_STORAGE_ENDPOINT for provider "${provider}" must use http or https.`)
  }

  parsed.pathname = ''
  parsed.search = ''
  parsed.hash = ''

  const normalizedEndpoint = parsed.toString().replace(/\/+$/, '')
  if (provider !== 'r2') {
    return normalizedEndpoint
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('ASSET_STORAGE_ENDPOINT for provider "r2" must start with https://.')
  }

  if (trimmedEndpoint.includes('<') || trimmedEndpoint.includes('>')) {
    throw new Error('ASSET_STORAGE_ENDPOINT for provider "r2" cannot contain placeholder markers like <ACCOUNT_ID>.')
  }

  if (parsed.pathname && parsed.pathname !== '/') {
    throw new Error('ASSET_STORAGE_ENDPOINT for provider "r2" cannot contain a path.')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('ASSET_STORAGE_ENDPOINT for provider "r2" cannot contain query or hash fragments.')
  }

  const hostname = parsed.hostname.toLowerCase()
  const hostPattern = /^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.r2\.cloudflarestorage\.com$/
  if (!hostPattern.test(hostname)) {
    throw new Error(
      'ASSET_STORAGE_ENDPOINT for provider "r2" must match https://ACCOUNT_ID.r2.cloudflarestorage.com or a jurisdiction variant.',
    )
  }

  const hostLabels = hostname.split('.')
  if (hostLabels.length < 4) {
    throw new Error('ASSET_STORAGE_ENDPOINT for provider "r2" is malformed.')
  }

  const accountIdLabel = hostLabels[0] ?? ''
  if (!accountIdLabel || accountIdLabel === 'bucket') {
    throw new Error('ASSET_STORAGE_ENDPOINT for provider "r2" must start with the Cloudflare account id.')
  }

  if (hostLabels.length > 5) {
    throw new Error('ASSET_STORAGE_ENDPOINT for provider "r2" appears to include an embedded bucket hostname.')
  }

  return normalizedEndpoint
}

function normalizeAssetStorageRegion(provider: AssetStorageProvider, region: string | undefined) {
  const trimmedRegion = trimOptionalEnv(region)
  if (provider === 'r2') {
    return 'auto'
  }

  return trimmedRegion
}

function readForcePathStyleEnv(provider: AssetStorageProvider) {
  const rawValue = trimOptionalEnv(process.env.ASSET_STORAGE_FORCE_PATH_STYLE)
  if (!rawValue) {
    return undefined
  }

  const normalizedValue = rawValue.toLowerCase()
  if (normalizedValue === 'true') {
    return true
  }
  if (normalizedValue === 'false') {
    return false
  }

  throw new Error(`ASSET_STORAGE_FORCE_PATH_STYLE must be "true" or "false" when provider "${provider}" uses remote storage.`)
}

async function toBuffer(body: unknown) {
  if (!body || typeof body !== 'object') {
    return null
  }

  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === 'function') {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray()
    return Buffer.from(bytes)
  }

  if (typeof (body as { transformToWebStream?: () => ReadableStream<Uint8Array> }).transformToWebStream === 'function') {
    const stream = (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream()
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let totalLength = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (!value) {
        continue
      }
      chunks.push(value)
      totalLength += value.byteLength
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalLength)
  }

  if (Symbol.asyncIterator in body) {
    const chunks: Buffer[] = []
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  return null
}

export class AssetStorageService {
  private remoteClient: S3Client | null

  constructor(private readonly config: AssetStorageConfig) {
    this.remoteClient = shouldUseRemoteStorage(config.provider)
      ? new S3Client({
          region: config.region,
          endpoint: config.endpoint,
          credentials:
            config.accessKeyId && config.secretAccessKey
              ? {
                  accessKeyId: config.accessKeyId,
                  secretAccessKey: config.secretAccessKey,
                }
              : undefined,
          forcePathStyle: config.forcePathStyle,
        })
      : null
  }

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
    if (this.config.publicBaseUrl) {
      return `${this.config.publicBaseUrl.replace(/\/+$/, '')}${this.config.publicBasePath}/${normalizedKey}`
    }
    return `${this.config.publicBasePath}/${normalizedKey}`
  }

  isSafePublicUrl(url?: string) {
    return isSafePublicUrl(url)
  }

  async healthCheck(): Promise<AssetStorageHealth> {
    if (shouldUseRemoteStorage(this.config.provider)) {
      if (!this.remoteClient || !this.config.bucket || !this.config.region || !this.config.endpoint) {
        return {
          ready: false,
          status: 'failed',
          provider: this.config.provider,
          detail: 'Remote asset storage is missing required configuration.',
        }
      }

      try {
        await this.remoteClient.send(new HeadBucketCommand({ Bucket: this.config.bucket }))
        return {
          ready: true,
          status: 'ready',
          provider: this.config.provider,
          detail: `Bucket "${this.config.bucket}" reachable.`,
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unable to reach remote asset bucket.'
        return {
          ready: true,
          status: 'degraded',
          provider: this.config.provider,
          detail: 'Remote asset storage is configured and runtime operations may still succeed.',
          warning: `HeadBucket warning: ${detail}`,
        }
      }
    }

    await mkdir(this.config.localDir, { recursive: true })
    return {
      ready: true,
      status: 'ready',
      provider: this.config.provider,
      localDir: this.config.localDir,
      detail: `Local asset storage directory "${this.config.localDir}" is ready.`,
    }
  }

  async uploadExportAsset(input: UploadExportAssetInput, baseUrl?: string): Promise<UploadExportAssetResult> {
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
    const contentType = input.contentType?.trim() || inferContentType(key)

    if (shouldUseRemoteStorage(this.config.provider)) {
      if (!this.remoteClient || !this.config.bucket) {
        throw new Error(`Storage provider "${this.config.provider}" is missing remote bucket configuration.`)
      }

      await this.remoteClient.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: input.content,
          ContentType: contentType,
        }),
      )

      return {
        key,
        url: this.getAssetUrl(key, baseUrl),
        contentType,
        size: input.content.byteLength,
      }
    }

    const filePath = this.getLocalFilePath(key)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, input.content)

    return {
      key,
      url: this.getAssetUrl(key, baseUrl),
      contentType,
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
    if (shouldUseRemoteStorage(this.config.provider)) {
      return false
    }

    await rm(this.getLocalFilePath(key), { force: true })
    return true
  }

  async readAsset(key: string): Promise<ReadAssetResult | null> {
    if (shouldUseRemoteStorage(this.config.provider)) {
      if (!this.remoteClient || !this.config.bucket) {
        return null
      }

      try {
        const response = await this.remoteClient.send(
          new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
          }),
        )
        const buffer = await toBuffer(response.Body)
        if (!buffer) {
          return null
        }

        return {
          key,
          buffer,
          contentType: response.ContentType?.trim() || inferContentType(key),
        }
      } catch (error) {
        if (error instanceof NoSuchKey) {
          return null
        }
        if (error instanceof S3ServiceException && error.name === 'NoSuchKey') {
          return null
        }
        throw error
      }
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
  const provider = process.env.ASSET_STORAGE_PROVIDER?.trim().toLowerCase() ?? 'local'
  return {
    provider,
    localDir: process.env.ASSET_STORAGE_DIR?.trim() || path.join(rootDir, 'data', 'assets'),
    publicBasePath: normalizeBasePath(process.env.ASSET_PUBLIC_BASE_PATH ?? '/assets'),
    publicBaseUrl: trimOptionalEnv(process.env.ASSET_STORAGE_PUBLIC_BASE_URL),
    bucket: trimOptionalEnv(process.env.ASSET_STORAGE_BUCKET),
    region: normalizeAssetStorageRegion(provider, process.env.ASSET_STORAGE_REGION),
    endpoint: normalizeRemoteAssetEndpoint(provider, process.env.ASSET_STORAGE_ENDPOINT),
    accessKeyId: trimOptionalEnv(process.env.ASSET_STORAGE_ACCESS_KEY_ID),
    secretAccessKey: trimOptionalEnv(process.env.ASSET_STORAGE_SECRET_ACCESS_KEY),
    forcePathStyle: shouldUseRemoteStorage(provider) ? readForcePathStyleEnv(provider) : undefined,
  }
}

export function createAssetStorageService(config: AssetStorageConfig) {
  return new AssetStorageService(config)
}
