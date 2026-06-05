import type { StateContract } from '../foundation/contracts';

import { Button } from '../primitives/Button';
import { StateContractScaffold } from './StateContractScaffold';

type FallbackContractViewProps = {
  contract: StateContract;
  onRetry: () => void;
  onAlternative?: () => void;
};

export function FallbackContractView({ contract, onRetry, onAlternative }: FallbackContractViewProps) {
  return (
    <StateContractScaffold
      eyebrow={contract.eyebrow}
      title={contract.title}
      happened={contract.happened ?? 'Usamos uma rota de contingência para evitar interrupção da jornada.'}
      impact={contract.impact}
      continuity={contract.continuity}
      nextStep={contract.nextStep ?? 'Você pode seguir agora ou tentar atualizar quando preferir.'}
      expectedTimeLabel={contract.expectedTimeLabel ?? 'Nova tentativa recomendada em até 1 minuto.'}
      partialAvailabilityLabel={contract.partialAvailabilityLabel ?? 'Dados confirmados continuam visíveis; dados estimados podem variar.'}
      recoveryLabel={contract.recoveryLabel}
      toneClassName="ds-state-panel--estimated"
      actions={(
        <>
          <Button onClick={onRetry}>{contract.actionLabel}</Button>
          {contract.secondaryActionLabel && onAlternative ? (
            <Button variant="secondary" onClick={onAlternative}>{contract.secondaryActionLabel}</Button>
          ) : null}
        </>
      )}
    />
  );
}
