import type { EntityProfile } from '../../domain/entity/contracts/EntityProfile'
import type { EntityExportFormat } from '../../domain/entity/contracts/EntityExportProfile'
import { createHttpEntityExportApi } from '../../backend-bridge/api/entityExportApi'
import type { SocialExportTemplateId } from './socialTemplates'
import { getSocialExportModel } from '../../persona-lab/core/ritualCopy'

export type DistributionChannel = 'whatsapp' | 'instagram' | 'link'

export type ShareMetadata = {
  entityId: string
  publicName: string
  handle: string
  species: string
  variant: string
  entityType: string
  intensityLabel: string
  postureLabel: string
  signatureText: string
  exportFormat: EntityExportFormat
  exportStyle: string
  brandingMode: string
  visualSignature: string
  createdAt: string
}

export type SharePreview = {
  title: string
  description: string
  imageUrl?: string
  template?: SocialExportTemplateId
}

export type PreparedShare = {
  channel: DistributionChannel
  shareUrl: string
  text: string
  metadata: ShareMetadata
  preview: SharePreview
  asset?: {
    blob?: Blob
    url?: string
    fileName: string
  }
}

export type PublishedExport = PreparedShare & {
  exportId?: string
  publicLinks: {
    entity: string
    export?: string
  }
}

const entityExportApi = createHttpEntityExportApi()

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveVisualSignature(entity: EntityProfile) {
  return [
    entity.manifestation.mode,
    entity.manifestation.variant,
    entity.finalForm.presenceMode,
    entity.finalForm.silhouetteClarity,
    entity.export.exportStyle,
  ].join(':')
}

export function attachMetadata(args: {
  entity: EntityProfile
  exportFormat?: EntityExportFormat
}): ShareMetadata {
  const socialExport = getSocialExportModel({
    mode: args.entity.manifestation.mode,
    variant: args.entity.manifestation.variant,
    publicName: args.entity.social.publicName,
    handle: args.entity.social.handle,
    personaDNA: args.entity.personaDNA,
    finalForm: args.entity.finalForm,
    format: args.exportFormat === 'story' ? 'story' : 'link',
  })

  return {
    entityId: args.entity.id,
    publicName: args.entity.social.publicName,
    handle: args.entity.social.handle,
    species: args.entity.manifestation.mode,
    variant: args.entity.manifestation.variant,
    entityType: socialExport.entityType,
    intensityLabel: socialExport.intensityLabel,
    postureLabel: socialExport.postureLabel,
    signatureText: socialExport.signatureText,
    exportFormat: args.exportFormat ?? 'png',
    exportStyle: args.entity.export.exportStyle,
    brandingMode: args.entity.export.brandingMode,
    visualSignature: resolveVisualSignature(args.entity),
    createdAt: new Date().toISOString(),
  }
}

export function generateShareLink(args: {
  entity: EntityProfile
  baseUrl?: string
  channel?: DistributionChannel
}) {
  const baseUrl = args.baseUrl ?? globalThis.location?.origin ?? 'https://brandsoul.local'
  const handle = args.entity.social.handle.replace(/^@/, '')
  const url = new URL(`/entity/${slugify(handle || args.entity.id)}`, baseUrl)

  if (args.channel) {
    url.searchParams.set('source', args.channel)
  }

  return url.toString()
}

export function generatePublicLink(args: {
  entity: EntityProfile
  exportId?: string
  baseUrl?: string
}) {
  const baseUrl = args.baseUrl ?? globalThis.location?.origin ?? 'https://brandsoul.local'
  const entityLink = new URL(`/entity/${args.entity.id}`, baseUrl).toString()
  const exportLink = args.exportId
    ? new URL(`/entity/${args.entity.id}/export/${args.exportId}`, baseUrl).toString()
    : undefined

  return {
    entity: entityLink,
    ...(exportLink ? { export: exportLink } : {}),
  }
}

export function generatePreview(args: {
  entity: EntityProfile
  assetUrl?: string
  template?: SocialExportTemplateId
}): SharePreview {
  const socialExport = getSocialExportModel({
    mode: args.entity.manifestation.mode,
    variant: args.entity.manifestation.variant,
    publicName: args.entity.social.publicName,
    handle: args.entity.social.handle,
    personaDNA: args.entity.personaDNA,
    finalForm: args.entity.finalForm,
    format: args.template === 'instagram_story' ? 'story' : 'link',
  })
  const title = socialExport.previewTitle
  const description = `${socialExport.previewDescription} • ${socialExport.signatureText}`

  return {
    title,
    description,
    ...(args.assetUrl ? { imageUrl: args.assetUrl } : {}),
    ...(args.template ? { template: args.template } : {}),
  }
}

export function prepareShare(args: {
  entity: EntityProfile
  channel: DistributionChannel
  exportFormat?: EntityExportFormat
  assetBlob?: Blob
  assetUrl?: string
  template?: SocialExportTemplateId
  baseUrl?: string
}): PreparedShare {
  const metadata = attachMetadata({
    entity: args.entity,
    exportFormat: args.exportFormat,
  })
  const shareUrl = generateShareLink({
    entity: args.entity,
    baseUrl: args.baseUrl,
    channel: args.channel,
  })
  const preview = generatePreview({
    entity: args.entity,
    assetUrl: args.assetUrl,
    template: args.template,
  })
  const socialExport = getSocialExportModel({
    mode: args.entity.manifestation.mode,
    variant: args.entity.manifestation.variant,
    publicName: args.entity.social.publicName,
    handle: args.entity.social.handle,
    personaDNA: args.entity.personaDNA,
    finalForm: args.entity.finalForm,
    format: args.exportFormat === 'story' ? 'story' : 'link',
  })
  const text =
    args.channel === 'whatsapp'
      ? `${preview.title}\n${socialExport.description}\n${socialExport.signatureText}\n${shareUrl}`
      : args.channel === 'instagram'
        ? `${preview.title} ${args.entity.social.handle}\n${socialExport.signatureText}`
        : `${preview.title} - ${socialExport.entityType} - ${shareUrl}`

  return {
    channel: args.channel,
    shareUrl,
    text,
    metadata,
    preview,
    ...(args.assetBlob || args.assetUrl
      ? {
          asset: {
            ...(args.assetBlob ? { blob: args.assetBlob } : {}),
            ...(args.assetUrl ? { url: args.assetUrl } : {}),
            fileName: `${slugify(args.entity.social.publicName || args.entity.id)}-${metadata.exportFormat}.png`,
          },
        }
      : {}),
  }
}

export async function trackEngagement(args: {
  entity: EntityProfile
  type: 'viewed' | 'interacted' | 'exported' | 'shared' | 'followed'
  source?: string
  actorId?: string
  weight?: number
  metadata?: Record<string, string | number | boolean | null | undefined>
}) {
  await entityExportApi.registerSignal({
    entityId: args.entity.id,
    type: args.type,
    source: args.source,
    weight: args.weight,
    metadata: args.metadata,
  })
}

export async function publishExport(args: {
  entity: EntityProfile
  channel: DistributionChannel
  exportFormat?: EntityExportFormat
  assetBlob?: Blob
  assetUrl?: string
  template?: SocialExportTemplateId
  baseUrl?: string
  source?: string
}) : Promise<PublishedExport> {
  const prepared = prepareShare(args)
  const logged = await entityExportApi.logExport({
    entityId: args.entity.id,
    format: args.exportFormat ?? 'png',
    fileUrl: args.assetUrl,
    assetBlob: args.assetBlob,
    fileName: prepared.asset?.fileName,
    contentType: args.assetBlob?.type,
    assetKind: args.exportFormat === 'avatar' ? 'avatar' : 'original',
    metadata: {
      source: args.source ?? 'distribution-service',
      channel: args.channel,
      template: args.template ?? 'none',
      publicName: args.entity.social.publicName,
      handle: args.entity.social.handle,
    },
  })

  await trackEngagement({
    entity: args.entity,
    type: 'shared',
    source: args.channel,
    weight: 0.66,
    metadata: {
      exportFormat: args.exportFormat ?? 'png',
      ...(logged?.export.id ? { exportId: logged.export.id } : {}),
    },
  })

  return {
    ...prepared,
    ...(logged?.export.id ? { exportId: logged.export.id } : {}),
    publicLinks: logged
      ? {
          entity: logged.entityLink,
          export: logged.publicLink,
        }
      : generatePublicLink({
          entity: args.entity,
          baseUrl: args.baseUrl,
        }),
  }
}
