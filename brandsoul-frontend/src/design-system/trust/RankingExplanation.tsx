import type { DataConfidence } from '../foundation/contracts';
import { DataConfidenceBadge } from './DataConfidenceBadge';

type RankingFactor = {
  label: string;
  influence: 'high' | 'medium' | 'low';
  confidence: DataConfidence;
};

type RankingExplanationProps = {
  title?: string;
  factors: RankingFactor[];
};

export function RankingExplanation({ title = 'Por que este escritório apareceu', factors }: RankingExplanationProps) {
  return (
    <section className="ds-surface-panel" aria-label="Ranking explanation">
      <strong>{title}</strong>
      <ul className="ds-inline-list">
        {factors.map((factor) => (
          <li key={`${factor.label}-${factor.influence}`}>
            {factor.label} ({factor.influence}) <DataConfidenceBadge confidence={factor.confidence} />
          </li>
        ))}
      </ul>
    </section>
  );
}
