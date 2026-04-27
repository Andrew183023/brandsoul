import { createAdminEntity } from '../backend-bridge/api/adminApi'

const ENTITY_BIRTH_DRAFT_KEY = 'brandsoul.entity.birth.draft'
const ENTITY_BIRTH_CONTINUATION_KEY = 'brandsoul.entity.birth.continuation'
const DEFAULT_ENTITY_PRIMARY_COLOR = '#f97316'

type EntityBirthDraft = {
  brandName: string
}

function isBrowser() {
  return typeof window !== 'undefined'
}

export function loadEntityBirthDraft(): EntityBirthDraft | null {
  if (!isBrowser()) {
    return null
  }

  const rawDraft = window.localStorage.getItem(ENTITY_BIRTH_DRAFT_KEY)
  if (!rawDraft) {
    return null
  }

  try {
    const parsedDraft = JSON.parse(rawDraft) as Partial<EntityBirthDraft>
    const brandName = parsedDraft.brandName?.trim()
    if (!brandName) {
      window.localStorage.removeItem(ENTITY_BIRTH_DRAFT_KEY)
      return null
    }

    return { brandName }
  } catch {
    window.localStorage.removeItem(ENTITY_BIRTH_DRAFT_KEY)
    return null
  }
}

export function saveEntityBirthDraft(brandName: string) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(
    ENTITY_BIRTH_DRAFT_KEY,
    JSON.stringify({
      brandName: brandName.trim(),
    }),
  )
}

export function clearEntityBirthDraft() {
  if (!isBrowser()) {
    return
  }

  window.localStorage.removeItem(ENTITY_BIRTH_DRAFT_KEY)
}

export function markEntityBirthContinuationPending() {
  if (!isBrowser()) {
    return
  }

  window.sessionStorage.setItem(ENTITY_BIRTH_CONTINUATION_KEY, 'pending')
}

export function clearEntityBirthContinuationPending() {
  if (!isBrowser()) {
    return
  }

  window.sessionStorage.removeItem(ENTITY_BIRTH_CONTINUATION_KEY)
}

export function hasEntityBirthContinuationPending() {
  if (!isBrowser()) {
    return false
  }

  return window.sessionStorage.getItem(ENTITY_BIRTH_CONTINUATION_KEY) === 'pending'
}

export async function createEntityFromBrandName(brandName: string) {
  const payload = await createAdminEntity({
    name: brandName.trim(),
    category: 'general',
    primaryColor: DEFAULT_ENTITY_PRIMARY_COLOR,
  })

  return payload
}

export async function finalizePendingEntityBirth() {
  const birthDraft = loadEntityBirthDraft()
  if (!birthDraft) {
    clearEntityBirthContinuationPending()
    return null
  }

  markEntityBirthContinuationPending()

  const payload = await createEntityFromBrandName(birthDraft.brandName)
  clearEntityBirthDraft()
  clearEntityBirthContinuationPending()
  return payload
}