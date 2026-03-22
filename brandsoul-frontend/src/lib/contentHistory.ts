export interface ParsedContentBlocks {
  principal?: string
  cta?: string
  variacao?: string
  hashtags?: string
  options?: string[]
}

export interface ParsedContent {
  contentType: string
  rawText: string
  blocks: ParsedContentBlocks
}

export interface ContentHistoryItem {
  id: string
  created_at: string
  content_type: string
  raw_text: string
  parsed_blocks: ParsedContentBlocks
}

type ParsedContentTextSection = Exclude<keyof ParsedContentBlocks, 'options'>

const CONTENT_HISTORY_LIMIT = 10

function normalizeLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

function sanitizeKeyPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function inferContentType(rawType?: string, blocks?: ParsedContentBlocks) {
  const normalizedType = rawType ? normalizeLabel(rawType) : ''
  if (normalizedType.includes('instagram')) {
    return 'instagram_post'
  }

  if (normalizedType.includes('story')) {
    return 'story'
  }

  if (normalizedType.includes('whatsapp')) {
    return 'whatsapp_message'
  }

  if (normalizedType.includes('promoc')) {
    return 'promotion'
  }

  if (normalizedType === 'cta') {
    return 'cta'
  }

  if (blocks?.options?.length) {
    return 'cta'
  }

  if (blocks?.hashtags) {
    return 'instagram_post'
  }

  return 'content'
}

export function parseStructuredContent(rawText: string): ParsedContent | null {
  const normalizedText = rawText.trim()
  if (!normalizedText) {
    return null
  }

  const lines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) {
    return null
  }

  let rawType = ''
  let currentSection: ParsedContentTextSection | 'option' | null = null
  const blocks: ParsedContentBlocks = {}
  const optionValues: string[] = []

  for (const line of lines) {
    if (line.startsWith('[') && line.endsWith(']')) {
      rawType = line.slice(1, -1).trim()
      currentSection = null
      continue
    }

    const sectionMatch = line.match(/^([^:]+):\s*(.*)$/)
    if (sectionMatch) {
      const [, rawLabel, initialValue] = sectionMatch
      const label = normalizeLabel(rawLabel)

      if (label === 'principal') {
        currentSection = 'principal'
        blocks.principal = initialValue.trim() || undefined
        continue
      }

      if (label === 'cta') {
        currentSection = 'cta'
        blocks.cta = initialValue.trim() || undefined
        continue
      }

      if (label === 'variacao') {
        currentSection = 'variacao'
        blocks.variacao = initialValue.trim() || undefined
        continue
      }

      if (label === 'hashtags') {
        currentSection = 'hashtags'
        blocks.hashtags = initialValue.trim() || undefined
        continue
      }

      if (label.startsWith('opcao')) {
        currentSection = 'option'
        if (initialValue.trim()) {
          optionValues.push(initialValue.trim())
        }
        continue
      }
    }

    if (currentSection === 'option') {
      optionValues.push(line)
      continue
    }

    if (currentSection) {
      const blockKey = currentSection as ParsedContentTextSection
      const currentValue = blocks[blockKey]
      blocks[blockKey] = currentValue ? `${currentValue}\n${line}` : line
    }
  }

  if (optionValues.length > 0) {
    blocks.options = optionValues.slice(0, 3)
  }

  const hasStructuredBlocks =
    Boolean(blocks.principal || blocks.cta || blocks.variacao || blocks.hashtags) ||
    (blocks.options?.length ?? 0) > 0

  if (!hasStructuredBlocks) {
    return null
  }

  return {
    contentType: inferContentType(rawType, blocks),
    rawText: normalizedText,
    blocks,
  }
}

export function getContentHistoryStorageKey(params: {
  brandName: string
  tone: string
  power: string
  voiceStyle: string
}) {
  const personaKey = [params.brandName, params.tone, params.power, params.voiceStyle]
    .map(sanitizeKeyPart)
    .filter(Boolean)
    .join('_')

  return `brandsoul_content_history_${personaKey || 'default'}`
}

export function loadContentHistory(storageKey: string): ContentHistoryItem[] {
  const rawHistory = window.localStorage.getItem(storageKey)
  if (!rawHistory) {
    return []
  }

  try {
    const parsedHistory = JSON.parse(rawHistory) as ContentHistoryItem[]
    return Array.isArray(parsedHistory) ? parsedHistory.slice(0, CONTENT_HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

export function saveContentHistory(storageKey: string, items: ContentHistoryItem[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(items.slice(0, CONTENT_HISTORY_LIMIT)))
}

export function prependContentHistoryItem(storageKey: string, item: ContentHistoryItem) {
  const existingHistory = loadContentHistory(storageKey)
  const nextHistory = [item, ...existingHistory].slice(0, CONTENT_HISTORY_LIMIT)
  saveContentHistory(storageKey, nextHistory)
  return nextHistory
}

export function clearContentHistory(storageKey: string) {
  window.localStorage.removeItem(storageKey)
}

export function buildContentHistoryItem(parsedContent: ParsedContent): ContentHistoryItem {
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    content_type: parsedContent.contentType,
    raw_text: parsedContent.rawText,
    parsed_blocks: parsedContent.blocks,
  }
}
