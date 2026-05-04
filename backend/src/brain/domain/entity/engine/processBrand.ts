type JsonRecord = Record<string, unknown>

type ProcessBrandEntityInput = {
  brand?: JsonRecord
  context?: {
    brandCategory?: string
    styleAnswers?: JsonRecord
  }
  palette?: {
    primary?: string
    secondary?: string
    contrast?: 'high' | 'medium' | 'low'
  }
  manifestation?: JsonRecord
}

type ProcessBrandOptions = {
  intensity?: 'soft' | 'balanced' | 'cinematic'
  runtimeControl?: JsonRecord
  requestId?: string
  source?: string
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
  if (normalized) {
    return `entity-${normalized}-${Math.random().toString(36).slice(2, 8)}`
  }

  return `entity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? value as JsonRecord : {}
}

function pickBrandName(brand?: JsonRecord) {
  const candidates = [
    brand?.name,
    brand?.brandName,
    brand?.title,
    brand?.displayName,
  ]

  for (const candidate of candidates) {
    const name = readString(candidate)
    if (name) {
      return name
    }
  }

  return 'Untitled Entity'
}

function resolveSpecies(input: ProcessBrandEntityInput | undefined, intensity: string | undefined) {
  const directMode = readString(input?.manifestation?.mode)
  if (directMode) {
    return directMode
  }

  const directIntensity = readString(intensity)
  if (directIntensity) {
    return directIntensity
  }

  return 'brand-avatar'
}

function resolveLanguageStyle(styleAnswers?: JsonRecord) {
  const candidates = [
    styleAnswers?.languageStyle,
    styleAnswers?.tone,
    styleAnswers?.voice,
    styleAnswers?.vibe,
  ]

  for (const candidate of candidates) {
    const value = readString(candidate)
    if (value) {
      return value
    }
  }

  return 'balanced'
}

export function processBrand(entityInput: unknown, options: ProcessBrandOptions = {}): JsonRecord {
  const safeInput = readRecord(entityInput) as ProcessBrandEntityInput
  const brand = readRecord(safeInput.brand)
  const context = readRecord(safeInput.context) as ProcessBrandEntityInput['context']
  const styleAnswers = readRecord(context?.styleAnswers)
  const palette = readRecord(safeInput.palette) as ProcessBrandEntityInput['palette']
  const now = new Date().toISOString()
  const brandName = pickBrandName(brand)
  const entityId = createEntityId(`${brandName}-${options.requestId ?? 'engine'}`)
  const species = resolveSpecies(safeInput, options.intensity)
  const languageStyle = resolveLanguageStyle(styleAnswers)
  const socialLine =
    readString(styleAnswers.tagline) ||
    readString(styleAnswers.manifesto) ||
    `${brandName} is ready to interact.`

  return {
    id: entityId,
    brand,
    context: {
      brandCategory: context?.brandCategory ?? 'general',
      styleAnswers,
      languageStyle,
    },
    palette: {
      primary: palette?.primary ?? '#000000',
      secondary: palette?.secondary ?? palette?.primary ?? '#000000',
      contrast: palette?.contrast ?? 'medium',
    },
    manifestation: {
      ...readRecord(safeInput.manifestation),
      mode: species,
      intensity: options.intensity ?? 'balanced',
    },
    social: {
      publicName: brandName,
      category: context?.brandCategory ?? 'general',
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
    relational: {
      behaviorState: {
        affinityScore: 0.32,
        behavioralTemperature: languageStyle,
        relationshipMode: 'adaptive',
      },
      progression: {
        level: 1,
      },
      binding: {
        bindingStrength: 0.24,
      },
      userMemory: {
        knownPreferences: [],
        lastInteractions: [],
        memoryConfidence: 0.2,
        lastActiveAt: now,
      },
      timelineLog: {
        entries: [],
        lastEventAt: now,
      },
    },
    runtime: {
      control: options.runtimeControl ?? {},
      engine: {
        source: options.source ?? 'backend-engine',
        requestId: options.requestId,
      },
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
      requestId: options.requestId,
    },
  }
}