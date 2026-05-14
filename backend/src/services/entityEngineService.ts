import { createHash } from 'node:crypto'

type JsonRecord = Record<string, unknown>

type ProcessBrandInput = {
  requestId: string
  createdAt?: string
  authoritySeed?: {
    tenantId?: number
    userId?: number
  }
  entityInput?: {
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
  manifestation?: {
    intensity?: 'soft' | 'balanced' | 'cinematic'
  }
  runtimeControl?: JsonRecord
}

type ProcessBrandResult =
  | {
      status: 'ready'
      entity: JsonRecord
    }
  | {
      status: 'failed'
      error: {
        code: 'ENGINE_PROCESS_FAILED'
        message: string
      }
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

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

function resolveSpecies(input: ProcessBrandInput) {
  const directMode = readString(input.entityInput?.manifestation?.mode)
  if (directMode) {
    return directMode
  }

  const intensity = readString(input.manifestation?.intensity)
  if (intensity) {
    return intensity
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

function buildFallbackEntity(input: ProcessBrandInput): JsonRecord {
  const brand = input.entityInput?.brand ?? {}
  const styleAnswers = input.entityInput?.context?.styleAnswers ?? {}
  const now = input.createdAt ?? new Date().toISOString()
  const brandName = pickBrandName(brand)
  const entityId = createEntityId([
    brandName,
    input.requestId,
    String(input.authoritySeed?.tenantId ?? ''),
    now,
  ].join('|'))
  const species = resolveSpecies(input)
  const languageStyle = resolveLanguageStyle(styleAnswers)
  const socialLine =
    readString(styleAnswers.tagline) ||
    readString(styleAnswers.manifesto) ||
    `${brandName} is ready to interact.`

  return {
    id: entityId,
    brand,
    context: {
      brandCategory: input.entityInput?.context?.brandCategory ?? 'general',
      styleAnswers,
      languageStyle,
    },
    palette: {
      primary: input.entityInput?.palette?.primary ?? '#000000',
      secondary: input.entityInput?.palette?.secondary ?? input.entityInput?.palette?.primary ?? '#000000',
      contrast: input.entityInput?.palette?.contrast ?? 'medium',
    },
    manifestation: {
      ...(input.entityInput?.manifestation ?? {}),
      mode: species,
      intensity: input.manifestation?.intensity ?? 'balanced',
    },
    social: {
      publicName: brandName,
      category: input.entityInput?.context?.brandCategory ?? 'general',
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
      control: input.runtimeControl ?? {},
      engine: {
        source: 'backend-engine-fallback',
        requestId: input.requestId,
      },
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
      requestId: input.requestId,
    },
  }
}

export async function processBrandInBackendEngine(input: ProcessBrandInput): Promise<ProcessBrandResult> {
  try {
    const sourceModule = await import('../brain/domain/entity/engine/processBrand.js')
    const processBrand = (sourceModule as { processBrand?: (entityInput: unknown, options: JsonRecord) => JsonRecord }).processBrand

    if (typeof processBrand === 'function') {
      const entity = processBrand(input.entityInput, {
        intensity: input.manifestation?.intensity,
        runtimeControl: input.runtimeControl,
        requestId: input.requestId,
        source: 'backend-engine',
      })

      return {
        status: 'ready',
        entity,
      }
    }
  } catch {
    // Fallback below is intentional during incremental recovery.
  }

  try {
    return {
      status: 'ready',
      entity: buildFallbackEntity(input),
    }
  } catch (error) {
    return {
      status: 'failed',
      error: {
        code: 'ENGINE_PROCESS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown backend engine error.',
      },
    }
  }
}
