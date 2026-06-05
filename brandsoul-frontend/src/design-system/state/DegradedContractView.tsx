import type { StateContract } from '../foundation/contracts';

import { Button } from '../primitives/Button';
import { StateContractScaffold } from './StateContractScaffold';

type DegradedContractViewProps = {
  contract: StateContract;
  onContinue: () => void;
  onAlternative?: () => void;
};

export function DegradedContractView({ contract, onContinue, onAlternative }: DegradedContractViewProps) {
  return (
    <StateContractScaffold
      eyebrow={contract.eyebrow}
      title={contract.title}
      happened={contract.happened ?? 'Parte do serviço está operando em modo reduzido para manter estabilidade geral.'}
      impact={contract.impact}
      continuity={contract.continuity}
      nextStep={contract.nextStep ?? 'Continue com os dados confirmados enquanto reequilibramos a capacidade.'}
      expectedTimeLabel={contract.expectedTimeLabel ?? 'Reavaliação automática prevista em até 5 minutos.'}
      partialAvailabilityLabel={contract.partialAvailabilityLabel ?? 'Recursos essenciais seguem ativos; recursos secundários podem oscilar.'}
      recoveryLabel={contract.recoveryLabel}
      toneClassName="ds-state-panel--degraded"
      actions={(
        <>
          <Button onClick={onContinue}>{contract.actionLabel}</Button>
          {contract.secondaryActionLabel && onAlternative ? (
            <Button variant="secondary" onClick={onAlternative}>{contract.secondaryActionLabel}</Button>
          ) : null}
        </>
      )}
    />
  );
}
