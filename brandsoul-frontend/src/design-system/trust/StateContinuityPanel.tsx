import { Button } from '../primitives/Button';

type StateContinuityPanelProps = {
  title: string;
  impact: string;
  continuity: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

export function StateContinuityPanel(props: StateContinuityPanelProps) {
  const {
    title,
    impact,
    continuity,
    primaryActionLabel,
    onPrimaryAction,
    secondaryActionLabel,
    onSecondaryAction,
  } = props;

  return (
    <section className="ds-surface-panel" aria-live="polite">
      <strong>{title}</strong>
      <p className="ds-state-panel__meta">Impacto: {impact}</p>
      <p className="ds-state-panel__meta">Continuidade: {continuity}</p>
      <div className="ds-row">
        <Button onClick={onPrimaryAction}>{primaryActionLabel}</Button>
        {secondaryActionLabel && onSecondaryAction ? (
          <Button variant="secondary" onClick={onSecondaryAction}>{secondaryActionLabel}</Button>
        ) : null}
      </div>
    </section>
  );
}
