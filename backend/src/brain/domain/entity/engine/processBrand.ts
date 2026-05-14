import { createHash } from 'node:crypto'

type JsonRecord = Record<string, unknown>

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function createEntityId(seed: string) {
  const normalized = slugify(seed)
  const fingerprint = createHash('sha256').update(seed).digest('hex').slice(0, 10)
  if (normalized) {
    return `entity-${normalized}-${fingerprint}`
  }

  return `entity-${fingerprint}`
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {}
}

export function processBrand(entityInput: unknown, options: JsonRecord = {}): JsonRecord {
  const input = asRecord(entityInput)
  const brand = asRecord(input.brand)
  const context = asRecord(input.context)
  const styleAnswers = asRecord(context.styleAnswers)
  const manifestation = asRecord(input.manifestation)
  const runtimeControl = asRecord(options.runtimeControl)

  const requestId = readString(options.requestId)
  const createdAt = readString(options.createdAt) || new Date().toISOString()
  const brandName =
    readString(brand.name) ||
    readString(brand.brandName) ||
    readString(brand.title) ||
    readString(brand.displayName) ||
    'Untitled Entity'

  const species =
    readString(manifestation.mode) ||
    readString(options.intensity) ||
    'brand-avatar'

  const languageStyle =
    readString(styleAnswers.languageStyle) ||
    readString(styleAnswers.tone) ||
    readString(styleAnswers.voice) ||
    readString(styleAnswers.vibe) ||
    'balanced'

  const entityId = createEntityId([brandName, requestId, createdAt].join('|'))
  const socialLine =
    readString(styleAnswers.tagline) ||
    readString(styleAnswers.manifesto) ||
    `${brandName} is ready to interact.`

  return {
    id: entityId,
    brand,
    context: {
      brandCategory: readString(context.brandCategory) || 'general',
      styleAnswers,
      languageStyle,
    },
    manifestation: {
      ...manifestation,
      mode: species,
      intensity: readString(options.intensity) || 'balanced',
    },
    social: {
      publicName: brandName,
      category: readString(context.brandCategory) || 'general',
      visibility: 'public',
      tags: [],
    },
    finalForm: {
      identity: {
        name: brandName,
        socialLine,
        openingLine: `Hello, I am ${brandName}.`,
        manifesto: readString(styleAnswers.manifesto) || undefined,
      },
    },
    runtime: {
      control: runtimeControl,
      engine: {
        source: readString(options.source) || 'backend-engine',
        requestId: requestId || undefined,
      },
    },
    metadata: {
      createdAt,
      updatedAt: createdAt,
      requestId: requestId || undefined,
    },
  }
}
