import type { StateContract } from '../foundation/contracts';

import { Button } from '../primitives/Button';
import { StateContractScaffold } from './StateContractScaffold';

type UnavailableContractViewProps = {
  contract: StateContract;
  onRetry: () => void;
  onAlternative?: () => void;
};

export function UnavailableContractView({ contract, onRetry, onAlternative }: UnavailableContractViewProps) {
  return (
    <StateContractScaffold
      eyebrow={contract.eyebrow}
      title={contract.title}
      happened={contract.happened ?? 'Este ponto da jornada está temporariamente indisponível.'}
      impact={contract.impact}
      continuity={contract.continuity}
      nextStep={contract.nextStep ?? 'Tente novamente ou siga para uma alternativa segura sem perder contexto.'}
      expectedTimeLabel={contract.expectedTimeLabel ?? 'Nova tentativa recomendada em até 3 minutos.'}
      partialAvailabilityLabel={contract.partialAvailabilityLabel ?? 'As demais áreas ativas continuam operacionais com estado de confiança visível.'}
      recoveryLabel={contract.recoveryLabel}
      toneClassName="ds-state-panel--unavailable"
      actions={(
        <>
          <Button onClick={onRetry}>{contract.actionLabel}</Button>
          {contract.secondaryActionLabel && onAlternative ? (
            <Button variant="ghost" onClick={onAlternative}>{contract.secondaryActionLabel}</Button>
          ) : null}
        </>
      )}
    />
  );
}
