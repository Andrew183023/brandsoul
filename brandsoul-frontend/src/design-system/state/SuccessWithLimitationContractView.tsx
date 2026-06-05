import type { StateContract } from '../foundation/contracts';

import { Button } from '../primitives/Button';
import { StateContractScaffold } from './StateContractScaffold';

type SuccessWithLimitationContractViewProps = {
  contract: StateContract;
  limitationLabel: string;
  onContinue: () => void;
  onReviewLimitations?: () => void;
};

export function SuccessWithLimitationContractView({
  contract,
  limitationLabel,
  onContinue,
  onReviewLimitations,
}: SuccessWithLimitationContractViewProps) {
  return (
    <StateContractScaffold
      title={contract.title}
      happened={contract.happened ?? 'Concluímos a etapa com sucesso, mas com uma limitação operacional controlada.'}
      impact={contract.impact}
      continuity={contract.continuity}
      nextStep={contract.nextStep ?? 'Você pode continuar normalmente, observando a limitação destacada.'}
      expectedTimeLabel={contract.expectedTimeLabel ?? 'Revisão desta limitação prevista em até 10 minutos.'}
      partialAvailabilityLabel={contract.partialAvailabilityLabel ?? limitationLabel}
      toneClassName="ds-state-panel--confirmed"
      extra={<p className="ds-state-panel__meta">Limitação atual: {limitationLabel}</p>}
      actions={(
        <>
          <Button onClick={onContinue}>{contract.actionLabel}</Button>
          {contract.secondaryActionLabel && onReviewLimitations ? (
            <Button variant="secondary" onClick={onReviewLimitations}>{contract.secondaryActionLabel}</Button>
          ) : null}
        </>
      )}
    />
  );
}
