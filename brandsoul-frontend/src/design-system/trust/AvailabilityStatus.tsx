import type { DataConfidence } from '../foundation/contracts';
import { DataConfidenceBadge } from './DataConfidenceBadge';

type AvailabilityStatusProps = {
  label: string;
  details: string;
  confidence: DataConfidence;
};

export function AvailabilityStatus({ label, details, confidence }: AvailabilityStatusProps) {
  return (
    <section className="ds-state-panel ds-state-panel--confirmed" aria-label="Availability status">
      <div className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{label}</strong>
        <DataConfidenceBadge confidence={confidence} />
      </div>
      <p className="ds-state-panel__meta">{details}</p>
    </section>
  );
}
