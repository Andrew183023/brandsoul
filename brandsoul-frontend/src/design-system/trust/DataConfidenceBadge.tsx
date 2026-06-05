import { dataConfidenceLabels, type DataConfidence } from '../foundation/contracts';
import { Badge } from '../primitives/Badge';

type DataConfidenceBadgeProps = {
  confidence: DataConfidence;
  label?: string;
};

export function DataConfidenceBadge({ confidence, label }: DataConfidenceBadgeProps) {
  return <Badge tone={confidence}>{label ?? dataConfidenceLabels[confidence]}</Badge>;
}
