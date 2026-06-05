import type { InputHTMLAttributes } from 'react';

import { cn } from '../utils/cn';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return <input className={cn('ds-control', 'motion-tactile', className)} {...props} />;
}
