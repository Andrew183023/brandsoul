import type { StateContract } from '../foundation/contracts';

import { Button } from '../primitives/Button';
import { StateContractScaffold } from './StateContractScaffold';

type OverloadContractViewProps = {
  contract: StateContract;
  queueLabel: string;
  onContinue: () => void;
  onRetry?: () => void;
};

export function OverloadContractView({ contract, queueLabel, onContinue, onRetry }: OverloadContractViewProps) {
  return (
    <StateContractScaffold
      title={contract.title}
      happened={contract.happened ?? 'Recebemos um volume acima do normal e ativamos priorização operacional.'}
      impact={contract.impact}
      continuity={contract.continuity}
      nextStep={contract.nextStep ?? `Mantemos a fila ${queueLabel} com atendimento por prioridade e continuidade.`}
      expectedTimeLabel={contract.expectedTimeLabel ?? 'Atualização de fila em tempo quase real, com revisão a cada 2 minutos.'}
      partialAvailabilityLabel={contract.partialAvailabilityLabel ?? 'Triagens críticas e fluxos ativos seguem funcionando durante a sobrecarga.'}
      toneClassName="ds-state-panel--overload"
      extra={<p className="ds-state-panel__meta">Fila atual: {queueLabel}</p>}
      actions={(
        <>
          <Button onClick={onContinue}>{contract.actionLabel}</Button>
          {onRetry ? <Button variant="secondary" onClick={onRetry}>Atualizar fila agora</Button> : null}
        </>
      )}
    />
  );
}
