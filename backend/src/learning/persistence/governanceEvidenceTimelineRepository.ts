import type { BackendDatabase } from '../../db/index.js'
import { traceMutation } from '../../sovereignty/authorityBoundary.js'
import {
  buildGovernanceEvidenceTimelineEventId,
  type AppendGovernanceEvidenceTimelineEventInput,
  type GovernanceEvidenceTimelineEvent,
  type GovernanceTimelineEventType,
  type GovernanceTimelineLongitudinalWindow,
  type GovernanceTimelineSeverity,
} from './GovernanceEvidenceTimelineEvent.js'

type GovernanceEvidenceTimelineRow = {
  event_id: string
  event_type: GovernanceTimelineEventType
  event_timestamp: string
  classification: GovernanceEvidenceTimelineEvent['classification']
  recommendation: 'do_not_rollout'
  severity: GovernanceTimelineSeverity
  trigger_factors_json: string
  replay_fingerprint: string
  longitudinal_window: GovernanceTimelineLongitudinalWindow
  source_evidence_id: string
  recorded_at: string
}

export type AppendGovernanceEvidenceTimelineEventResult = {
  event: GovernanceEvidenceTimelineEvent
  inserted: boolean
}

function parseTriggerFactors(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

function mapRow(row?: GovernanceEvidenceTimelineRow): GovernanceEvidenceTimelineEvent | null {
  if (!row) {
    return null
  }

  return {
    eventId: row.event_id,
    eventType: row.event_type,
    timestamp: row.event_timestamp,
    classification: row.classification,
    recommendation: row.recommendation,
    severity: row.severity,
    triggerFactors: parseTriggerFactors(row.trigger_factors_json),
    replayFingerprint: row.replay_fingerprint,
    longitudinalWindow: row.longitudinal_window,
    sourceEvidenceId: row.source_evidence_id,
  }
}

export class GovernanceEvidenceTimelineRepository {
  constructor(private readonly db: BackendDatabase) {}

  async appendEvent(input: AppendGovernanceEvidenceTimelineEventInput): Promise<AppendGovernanceEvidenceTimelineEventResult> {
    const eventId = input.eventId ?? buildGovernanceEvidenceTimelineEventId(input)
    const recordedAt = new Date().toISOString()
    const triggerFactors = [...new Set(input.triggerFactors)].sort((left, right) => left.localeCompare(right))

    traceMutation({
      source: 'backend/src/learning/persistence/governanceEvidenceTimelineRepository.ts#appendEvent',
      type: 'portfolio',
      targetId: eventId,
      whatChanged: 'append governance evidence timeline event',
    })

    const result = await this.db.run(
      `
        INSERT INTO flowmind_governance_evidence_timeline (
          event_id,
          event_type,
          event_timestamp,
          classification,
          recommendation,
          severity,
          trigger_factors_json,
          replay_fingerprint,
          longitudinal_window,
          source_evidence_id,
          recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO NOTHING
      `,
      eventId,
      input.eventType,
      input.timestamp,
      input.classification,
      input.recommendation,
      input.severity,
      JSON.stringify(triggerFactors),
      input.replayFingerprint,
      input.longitudinalWindow,
      input.sourceEvidenceId,
      recordedAt,
    )

    const event = await this.getEventById(eventId)
    if (!event) {
      throw new Error(`Failed to append governance timeline event ${eventId}.`)
    }

    return {
      event,
      inserted: (result.changes ?? 0) > 0,
    }
  }

  async getEventById(eventId: string): Promise<GovernanceEvidenceTimelineEvent | null> {
    const row = await this.db.get<GovernanceEvidenceTimelineRow>(
      `
        SELECT *
        FROM flowmind_governance_evidence_timeline
        WHERE event_id = ?
        LIMIT 1
      `,
      eventId,
    )

    return mapRow(row)
  }

  async countEvents(): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM flowmind_governance_evidence_timeline
      `,
    )

    return Math.max(0, Number(row?.count ?? 0))
  }

  async listEventsPaginated(args: { limit?: number, offset?: number } = {}): Promise<GovernanceEvidenceTimelineEvent[]> {
    const limit = Math.max(1, Math.min(500, Math.trunc(args.limit ?? 100)))
    const offset = Math.max(0, Math.trunc(args.offset ?? 0))

    const rows = await this.db.all<GovernanceEvidenceTimelineRow[]>(
      `
        SELECT *
        FROM flowmind_governance_evidence_timeline
        ORDER BY event_timestamp DESC, event_id DESC
        LIMIT ?
        OFFSET ?
      `,
      limit,
      offset,
    )

    return rows
      .map((row) => mapRow(row))
      .filter((row): row is GovernanceEvidenceTimelineEvent => row !== null)
  }

  async listEventsChronological(args: { limit?: number } = {}): Promise<GovernanceEvidenceTimelineEvent[]> {
    const limit = Math.max(1, Math.min(10_000, Math.trunc(args.limit ?? 1000)))

    const rows = await this.db.all<GovernanceEvidenceTimelineRow[]>(
      `
        SELECT *
        FROM flowmind_governance_evidence_timeline
        ORDER BY event_timestamp ASC, event_id ASC
        LIMIT ?
      `,
      limit,
    )

    return rows
      .map((row) => mapRow(row))
      .filter((row): row is GovernanceEvidenceTimelineEvent => row !== null)
  }
}

export function createGovernanceEvidenceTimelineRepository(db: BackendDatabase) {
  return new GovernanceEvidenceTimelineRepository(db)
}
