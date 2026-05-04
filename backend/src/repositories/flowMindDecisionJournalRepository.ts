import type { BackendDatabase } from '../db/index.js'

export type FlowMindDecisionJournalRecord = {
  commandId: string
  entityId: string
  decisionHash: string
  decisionJson: string
  createdAt: string
}

export class FlowMindDecisionJournalRepository {
  constructor(private readonly db: BackendDatabase) {}

  async save(record: FlowMindDecisionJournalRecord): Promise<FlowMindDecisionJournalRecord> {
    await this.db.run(
      `
        INSERT INTO flowmind_decision_journal (
          command_id,
          entity_id,
          decision_hash,
          decision_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(command_id) DO UPDATE SET
          entity_id = excluded.entity_id,
          decision_hash = excluded.decision_hash,
          decision_json = excluded.decision_json
      `,
      record.commandId,
      record.entityId,
      record.decisionHash,
      record.decisionJson,
      record.createdAt,
    )

    return record
  }
}

export function createFlowMindDecisionJournalRepository(db: BackendDatabase) {
  return new FlowMindDecisionJournalRepository(db)
}
