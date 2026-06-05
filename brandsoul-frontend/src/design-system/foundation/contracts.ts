export type DataConfidence = 'confirmed' | 'estimated' | 'unavailable' | 'degraded' | 'overload';

export type StateContract = {
  eyebrow?: string;
  title: string;
  happened?: string;
  impact: string;
  continuity: string;
  nextStep?: string;
  expectedTimeLabel?: string;
  partialAvailabilityLabel?: string;
  recoveryLabel?: string;
  actionLabel: string;
  secondaryActionLabel?: string;
};

export const dataConfidenceLabels: Record<DataConfidence, string> = {
  confirmed: 'Confirmado',
  estimated: 'Estimado',
  unavailable: 'Indisponível',
  degraded: 'Degradado',
  overload: 'Sobrecarga',
};
