import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn('ds-button', 'motion-tactile', `ds-button--${variant}`, className)} {...props} />;
}
