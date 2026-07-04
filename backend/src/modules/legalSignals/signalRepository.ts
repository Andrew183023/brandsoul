import type { LegalOperationalSignal } from './signalTypes.js'

function buildSignalKey(signal: LegalOperationalSignal) {
  return [
    signal.tenantId,
    signal.entityId,
    signal.signalType,
    signal.source,
    signal.caseId ?? '',
    signal.occurredAt,
  ].join('|')
}

export class InMemoryLegalSignalRepository {
  private readonly signals = new Map<string, LegalOperationalSignal>()

  upsert(signal: LegalOperationalSignal) {
    const key = buildSignalKey(signal)
    const existing = this.signals.get(key)
    if (existing) {
      return {
        created: false,
        signal: existing,
      }
    }

    this.signals.set(key, signal)
    return {
      created: true,
      signal,
    }
  }

  upsertMany(signals: LegalOperationalSignal[]) {
    const created: LegalOperationalSignal[] = []
    const existing: LegalOperationalSignal[] = []

    for (const signal of signals) {
      const result = this.upsert(signal)
      if (result.created) {
        created.push(result.signal)
      } else {
        existing.push(result.signal)
      }
    }

    return {
      created,
      existing,
    }
  }

  list() {
    return Array.from(this.signals.values()).sort((left, right) => {
      if (left.occurredAt !== right.occurredAt) {
        return left.occurredAt.localeCompare(right.occurredAt)
      }

      return `${left.signalType}:${left.caseId ?? ''}`.localeCompare(`${right.signalType}:${right.caseId ?? ''}`)
    })
  }

  size() {
    return this.signals.size
  }

  clear() {
    this.signals.clear()
  }
}

export function createInMemoryLegalSignalRepository() {
  return new InMemoryLegalSignalRepository()
}
