import type { OpeningHours } from './persona'

export type BusinessStatus = 'open' | 'closed'

function parseMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null
  }

  return hours * 60 + minutes
}

export function isBusinessOpen(openingHours?: OpeningHours, date = new Date()) {
  if (!openingHours) {
    return undefined
  }

  const startMinutes = parseMinutes(openingHours.start)
  const endMinutes = parseMinutes(openingHours.end)
  if (startMinutes === null || endMinutes === null) {
    return undefined
  }

  const currentMinutes = date.getHours() * 60 + date.getMinutes()
  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

export function getBusinessStatus(openingHours?: OpeningHours, date = new Date()): BusinessStatus | undefined {
  const isOpen = isBusinessOpen(openingHours, date)
  if (typeof isOpen !== 'boolean') {
    return undefined
  }

  return isOpen ? 'open' : 'closed'
}
