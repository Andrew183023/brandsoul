import type { ReactNode } from 'react';

import { Skeleton } from '../primitives/Skeleton';
import { StateContractScaffold } from './StateContractScaffold';

type LoadingContractViewProps = {
  label: string;
  details?: string;
  nextStepLabel?: string;
  expectedTimeLabel?: string;
  actions?: ReactNode;
};

export function LoadingContractView({
  label,
  details,
  nextStepLabel,
  expectedTimeLabel,
  actions,
}: LoadingContractViewProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <StateContractScaffold
        title={label}
        happened="Estamos organizando esta etapa para manter consistência e previsibilidade."
        impact={details ?? 'Você pode notar uma pequena espera antes do próximo bloco aparecer.'}
        continuity="Seu contexto atual permanece salvo e a jornada não reinicia."
        nextStep={nextStepLabel ?? 'Assim que a carga terminar, mostramos a próxima ação recomendada.'}
        expectedTimeLabel={expectedTimeLabel ?? 'Normalmente até 30 segundos em condições estáveis.'}
        toneClassName="ds-state-panel--estimated"
        extra={(
          <div className="ds-state-contract__skeletons">
            <Skeleton height="0.95rem" />
            <Skeleton height="0.95rem" width="70%" />
          </div>
        )}
        actions={actions}
      />
    </div>
  );
}
