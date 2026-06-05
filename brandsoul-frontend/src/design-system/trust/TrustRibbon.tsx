import { Card } from '../primitives/Card';

export function TrustRibbon() {
  return (
    <Card tone="subtle" className="ds-surface-panel ds-trust-panel" as="aside" aria-label="Trust commitments">
      <h3 className="ds-trust-title">Contrato institucional</h3>
      <p className="ds-subtitle">Cliente escolhe, escritório atende, plataforma organiza.</p>
    </Card>
  );
}
