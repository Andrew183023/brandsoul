import type { HTMLAttributes } from 'react';

import { cn } from '../utils/cn';

type CardTone = 'default' | 'subtle' | 'elevated';

type CardProps = HTMLAttributes<HTMLElement> & {
  tone?: CardTone;
  as?: 'section' | 'article' | 'div' | 'aside';
};

export function Card({ tone = 'default', className, as = 'section', ...props }: CardProps) {
  const Component = as;

  return <Component className={cn('ds-card', 'motion-surface', tone !== 'default' && `ds-card--${tone}`, className)} {...props} />;
}
