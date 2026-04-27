import type { EntityProfile } from '../../domain/entity/contracts/EntityProfile'
import type { PersonaLabPreview } from '../../domain/rendering/contracts/types'
import type { PersonaLabFinalPersona } from './finalPersonaBuilder'
import { getSocialExportModel } from './ritualCopy'

export type SocialOutputFormat = 'post' | 'story'

export interface SocialOutputConfig {
  format: SocialOutputFormat
  label: string
  ratio: string
  width: number
  height: number
  kicker: string
  ctaText: string
}

function escapeSvgText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildSocialSvg({
  width,
  height,
  preview,
  finalPersona,
  entityProfile,
  format,
}: {
  width: number
  height: number
  preview: PersonaLabPreview
  finalPersona: PersonaLabFinalPersona
  entityProfile?: EntityProfile
  format: SocialOutputFormat
}) {
  const accent = preview.visualConfig.accent
  const secondary = preview.visualConfig.secondary
  const socialExport = getSocialExportModel({
    mode: preview.manifestationMode,
    variant: preview.manifestationVariant,
    publicName: entityProfile?.social.publicName ?? finalPersona.name,
    handle: entityProfile?.social.handle,
    previewLabel: preview.label,
    previewDescription: preview.description,
    personaDNA: entityProfile?.personaDNA ?? preview.personaDNA,
    finalForm: entityProfile?.finalForm,
    format,
  })
  const concept = escapeSvgText(socialExport.entityType)
  const headline = escapeSvgText(socialExport.headline)
  const archetype = escapeSvgText(socialExport.description)
  const kickerText = escapeSvgText(socialExport.kicker)
  const subline = escapeSvgText(socialExport.signatureText)
  const footerLine = escapeSvgText(socialExport.ctaText)
  const glowOpacity = preview.visualConfig.glow === 'bold' ? 0.26 : preview.visualConfig.glow === 'focused' ? 0.18 : 0.14
  const isStory = height > width
  const orbY = isStory ? 360 : 258
  const headlineY = isStory ? 930 : 670
  const panelY = isStory ? 1030 : 760
  const panelWidth = width - (isStory ? 120 : 160)
  const panelHeight = isStory ? 310 : 170
  const panelX = (width - panelWidth) / 2

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#090d16"/>
        <stop offset="100%" stop-color="#05070d"/>
      </linearGradient>
      <radialGradient id="glowA" cx="50%" cy="40%" r="40%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="${glowOpacity}"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glowB" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${secondary}" stop-opacity="${glowOpacity * 0.9}"/>
        <stop offset="100%" stop-color="${secondary}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="core" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff8e8"/>
        <stop offset="35%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
      <linearGradient id="panelStroke" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.14)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.04)"/>
      </linearGradient>
      <filter id="blurGlow">
        <feGaussianBlur stdDeviation="18" />
      </filter>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <circle cx="${width / 2}" cy="${orbY}" r="${isStory ? 250 : 200}" fill="url(#glowA)" filter="url(#blurGlow)"/>
    <circle cx="${width / 2 + (isStory ? 26 : 30)}" cy="${orbY + 18}" r="${isStory ? 168 : 132}" fill="url(#glowB)" filter="url(#blurGlow)"/>
    <circle cx="${width / 2}" cy="${orbY}" r="${isStory ? 122 : 88}" fill="url(#core)"/>
    <rect x="${width / 2 - (isStory ? 72 : 52)}" y="${orbY - (isStory ? 72 : 52)}" width="${isStory ? 144 : 104}" height="${isStory ? 144 : 104}" rx="${preview.visualConfig.shape === 'prism' ? 26 : 52}" fill="${secondary}" fill-opacity="0.22" transform="rotate(${preview.visualConfig.shape === 'flare' ? -18 : preview.visualConfig.shape === 'prism' ? 24 : 0} ${width / 2} ${orbY})"/>
    <text x="50%" y="${isStory ? 130 : 110}" text-anchor="middle" fill="rgba(255,255,255,0.68)" font-size="${isStory ? 26 : 20}" font-family="Arial, sans-serif" letter-spacing="6">${concept.toUpperCase()}</text>
    <text x="50%" y="${headlineY}" text-anchor="middle" fill="#f8fafc" font-size="${isStory ? 64 : 44}" font-weight="700" font-family="Arial, sans-serif">${headline}</text>
    <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="${isStory ? 42 : 34}" fill="rgba(255,255,255,0.05)" stroke="url(#panelStroke)" />
    <text x="50%" y="${panelY + (isStory ? 72 : 52)}" text-anchor="middle" fill="${accent}" font-size="${isStory ? 26 : 18}" font-weight="700" font-family="Arial, sans-serif" letter-spacing="3">${kickerText.toUpperCase()}</text>
    <text x="50%" y="${panelY + (isStory ? 126 : 92)}" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="${isStory ? 30 : 20}" font-family="Arial, sans-serif">${archetype}</text>
    <text x="50%" y="${panelY + (isStory ? 186 : 132)}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="${isStory ? 24 : 18}" font-family="Arial, sans-serif">${subline}</text>
    <text x="50%" y="${height - (isStory ? 122 : 70)}" text-anchor="middle" fill="rgba(255,255,255,0.72)" font-size="${isStory ? 22 : 16}" font-family="Arial, sans-serif">Built with BrandSoul</text>
    <text x="50%" y="${height - (isStory ? 72 : 42)}" text-anchor="middle" fill="rgba(255,255,255,0.92)" font-size="${isStory ? 30 : 20}" font-weight="700" font-family="Arial, sans-serif">${footerLine}</text>
  </svg>`
}

export function buildSocialOutputConfig(format: SocialOutputFormat): SocialOutputConfig {
  if (format === 'story') {
    return {
      format,
      label: 'Story',
      ratio: '9:16',
      width: 1080,
      height: 1920,
      kicker: 'Persona Story',
      ctaText: 'Built with BrandSoul.',
    }
  }

  return {
    format,
    label: 'Post',
    ratio: '1:1',
    width: 1080,
    height: 1080,
    kicker: 'Persona Post',
    ctaText: 'My brand is now alive.',
  }
}

export function buildSocialPreviewDataUrl({
  preview,
  finalPersona,
  config,
  entityProfile,
}: {
  preview: PersonaLabPreview
  finalPersona: PersonaLabFinalPersona
  config: SocialOutputConfig
  entityProfile?: EntityProfile
}) {
  const svg = buildSocialSvg({
    width: config.width,
    height: config.height,
    preview,
    finalPersona,
    entityProfile,
    format: config.format,
  })

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export async function downloadSocialAsset({
  preview,
  finalPersona,
  format,
  entityProfile,
}: {
  preview: PersonaLabPreview
  finalPersona: PersonaLabFinalPersona
  format: SocialOutputFormat
  entityProfile?: EntityProfile
}) : Promise<Blob | undefined> {
  const config = buildSocialOutputConfig(format)
  const svg = buildSocialSvg({
    width: config.width,
    height: config.height,
    preview,
    finalPersona,
    entityProfile,
    format,
  })
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = reject
      nextImage.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = config.width
    canvas.height = config.height
    const context = canvas.getContext('2d')
    if (!context) {
      return undefined
    }

    context.drawImage(image, 0, 0, config.width, config.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png')
    })
    if (!blob) {
      return undefined
    }

    const dataUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `brandsoul-${preview.label.toLowerCase()}-${format}.png`
    link.click()
    URL.revokeObjectURL(dataUrl)
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
