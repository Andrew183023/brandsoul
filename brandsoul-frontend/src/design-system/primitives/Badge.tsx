import type { HTMLAttributes } from 'react';

import { cn } from '../utils/cn';
import type { DataConfidence } from '../foundation/contracts';

type BadgeTone = DataConfidence | 'neutral';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={cn('ds-badge', `ds-badge--${tone}`, className)} {...props} />;
}
