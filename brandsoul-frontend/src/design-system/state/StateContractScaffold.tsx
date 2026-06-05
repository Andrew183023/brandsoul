import type { ReactNode } from 'react';

type StateContractScaffoldProps = {
  eyebrow?: string;
  title: string;
  happened: string;
  impact: string;
  continuity: string;
  nextStep: string;
  expectedTimeLabel: string;
  partialAvailabilityLabel?: string;
  recoveryLabel?: string;
  toneClassName: 'ds-state-panel--confirmed' | 'ds-state-panel--estimated' | 'ds-state-panel--degraded' | 'ds-state-panel--overload' | 'ds-state-panel--unavailable';
  actions?: ReactNode;
  extra?: ReactNode;
};

export function StateContractScaffold(props: StateContractScaffoldProps) {
  const {
    eyebrow,
    title,
    happened,
    impact,
    continuity,
    nextStep,
    expectedTimeLabel,
    partialAvailabilityLabel,
    recoveryLabel,
    toneClassName,
    actions,
    extra,
  } = props;

  return (
    <section className={`ds-state-contract ds-feedback-surface motion-surface ${toneClassName}`} aria-live="polite">
      {eyebrow ? <p className="ds-state-contract__eyebrow">{eyebrow}</p> : null}
      <strong className="ds-state-contract__title">{title}</strong>
      <dl className="ds-state-contract__grid">
        <div>
          <dt>O que aconteceu</dt>
          <dd>{happened}</dd>
        </div>
        <div>
          <dt>O que muda agora</dt>
          <dd>{impact}</dd>
        </div>
        <div>
          <dt>O que continua funcionando</dt>
          <dd>{continuity}</dd>
        </div>
        <div>
          <dt>Como seguir</dt>
          <dd>{nextStep}</dd>
        </div>
        <div>
          <dt>O que esperar</dt>
          <dd>{expectedTimeLabel}</dd>
        </div>
        {partialAvailabilityLabel ? (
          <div>
            <dt>Leitura parcial</dt>
            <dd>{partialAvailabilityLabel}</dd>
          </div>
        ) : null}
      </dl>
      {recoveryLabel ? <p className="ds-state-contract__recovery">{recoveryLabel}</p> : null}
      {extra}
      {actions ? <div className="ds-row ds-cta-cluster">{actions}</div> : null}
    </section>
  );
}
