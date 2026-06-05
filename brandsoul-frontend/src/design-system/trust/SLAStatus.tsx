type SLAStatusTone = 'ok' | 'risk' | 'breach';

type SLAStatusProps = {
  valueLabel: string;
  tone: SLAStatusTone;
  details: string;
};

function resolveToneClass(tone: SLAStatusTone) {
  if (tone === 'risk') return 'ds-state-panel--estimated';
  if (tone === 'breach') return 'ds-state-panel--degraded';
  return 'ds-state-panel--confirmed';
}

export function SLAStatus({ valueLabel, tone, details }: SLAStatusProps) {
  return (
    <section className={`ds-state-panel ${resolveToneClass(tone)}`} aria-label="SLA status">
      <strong>SLA {valueLabel}</strong>
      <p className="ds-state-panel__meta">{details}</p>
    </section>
  );
}
