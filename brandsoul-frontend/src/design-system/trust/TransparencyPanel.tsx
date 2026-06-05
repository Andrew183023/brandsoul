import type { ReactNode } from 'react';

import { Accordion } from '../primitives/Accordion';
import { Card } from '../primitives/Card';

type TransparencyPanelProps = {
  summary: string;
  criteria: string[];
  details?: ReactNode;
};

export function TransparencyPanel({ summary, criteria, details }: TransparencyPanelProps) {
  return (
    <Card as="aside" className="ds-surface-panel ds-trust-panel" aria-label="Transparency panel">
      <h3 className="ds-trust-title">Transparencia operacional</h3>
      <p className="ds-subtitle">{summary}</p>
      <ul className="ds-inline-list">
        {criteria.map((criterion) => (
          <li key={criterion}>{criterion}</li>
        ))}
      </ul>
      {details ? <Accordion title="Ver detalhes de metodologia">{details}</Accordion> : null}
    </Card>
  );
}
