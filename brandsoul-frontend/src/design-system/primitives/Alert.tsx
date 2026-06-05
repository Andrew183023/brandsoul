import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utils/cn';

type AlertTone = 'info' | 'warning' | 'danger';

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  description?: ReactNode;
  tone?: AlertTone;
};

export function Alert({ tone = 'info', title, description, className, children, ...props }: AlertProps) {
  return (
    <div role="status" className={cn('ds-alert', `ds-alert--${tone}`, className)} {...props}>
      {title ? <p className="ds-alert__title">{title}</p> : null}
      {description ? <p className="ds-alert__description">{description}</p> : null}
      {children}
    </div>
  );
}
