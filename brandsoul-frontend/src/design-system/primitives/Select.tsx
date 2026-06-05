import type { SelectHTMLAttributes } from 'react';

import { cn } from '../utils/cn';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select className={cn('ds-control', 'motion-tactile', className)} {...props}>
      {children}
    </select>
  );
}
