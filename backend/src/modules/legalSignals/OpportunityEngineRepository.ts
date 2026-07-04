import type { OperationalOpportunity } from './OpportunityEngine.js'

export class InMemoryOpportunityEngineRepository {
  private readonly opportunities = new Map<string, OperationalOpportunity>()

  upsert(opportunity: OperationalOpportunity) {
    const existing = this.opportunities.get(opportunity.id)
    if (existing) {
      return {
        created: false,
        opportunity: existing,
      }
    }

    this.opportunities.set(opportunity.id, opportunity)
    return {
      created: true,
      opportunity,
    }
  }

  upsertMany(opportunities: OperationalOpportunity[]) {
    const created: OperationalOpportunity[] = []
    const existing: OperationalOpportunity[] = []

    for (const opportunity of opportunities) {
      const result = this.upsert(opportunity)
      if (result.created) {
        created.push(result.opportunity)
      } else {
        existing.push(result.opportunity)
      }
    }

    return {
      created,
      existing,
    }
  }

  get(id: string) {
    return this.opportunities.get(id) ?? null
  }

  list() {
    return Array.from(this.opportunities.values()).sort((left, right) => left.id.localeCompare(right.id))
  }

  clear() {
    this.opportunities.clear()
  }
}

export function createOpportunityEngineRepository() {
  return new InMemoryOpportunityEngineRepository()
}
