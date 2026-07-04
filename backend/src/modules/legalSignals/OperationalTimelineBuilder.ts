import type { OperationalTimelineBuildInput, OperationalTimelineEntry } from './OperationalTimeline.js'
import { interpretOperationalSignal } from './OperationalTimelineInterpreter.js'

function compareEntries(left: OperationalTimelineEntry, right: OperationalTimelineEntry) {
  if (left.occurredAt !== right.occurredAt) {
    return left.occurredAt.localeCompare(right.occurredAt)
  }

  if (left.signalType !== right.signalType) {
    return left.signalType.localeCompare(right.signalType)
  }

  return left.id.localeCompare(right.id)
}

export function buildOperationalTimeline(input: OperationalTimelineBuildInput): OperationalTimelineEntry[] {
  return input.signals
    .filter((signal) => signal.tenantId === input.tenantId && signal.entityId === input.entityId)
    .map((signal) => interpretOperationalSignal(signal))
    .sort(compareEntries)
}

export class OperationalTimelineBuilder {
  build(input: OperationalTimelineBuildInput) {
    return buildOperationalTimeline(input)
  }
}

export function createOperationalTimelineBuilder() {
  return new OperationalTimelineBuilder()
}
