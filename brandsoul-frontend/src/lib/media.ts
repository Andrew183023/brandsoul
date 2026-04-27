export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Não consegui ler este arquivo.'))
    reader.readAsDataURL(file)
  })
}

export type SupportedLogoFileFormat = 'svg' | 'png' | 'jpg'

const SVG_MIME_TYPES = new Set(['image/svg+xml', 'image/svg'])
const PNG_MIME_TYPES = new Set(['image/png', 'image/x-png'])
const JPG_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg'])

export function detectSupportedLogoFileFormat(file?: Pick<File, 'type' | 'name'>): SupportedLogoFileFormat | undefined {
  if (!file) {
    return undefined
  }

  const normalizedType = file.type.trim().toLowerCase()
  if (SVG_MIME_TYPES.has(normalizedType)) {
    return 'svg'
  }
  if (PNG_MIME_TYPES.has(normalizedType)) {
    return 'png'
  }
  if (JPG_MIME_TYPES.has(normalizedType)) {
    return 'jpg'
  }

  const normalizedName = file.name.trim().toLowerCase()
  if (normalizedName.endsWith('.svg')) {
    return 'svg'
  }
  if (normalizedName.endsWith('.png')) {
    return 'png'
  }
  if (normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) {
    return 'jpg'
  }

  return undefined
}

export function isSvgImageSource(imageSource: string) {
  const normalizedSource = imageSource.trim().toLowerCase()
  return normalizedSource.startsWith('<svg') || normalizedSource.startsWith('data:image/svg+xml')
}

export async function readFilesAsDataUrls(files: FileList | File[], limit?: number) {
  const resolvedFiles = Array.from(files).slice(0, limit)
  const dataUrls = await Promise.all(resolvedFiles.map((file) => readFileAsDataUrl(file)))
  return dataUrls.filter(Boolean)
}
