import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utils/cn';

type SectionProps = HTMLAttributes<HTMLElement> & {
  kicker?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  as?: 'section' | 'article' | 'div';
};

export function Section({ kicker, title, subtitle, as = 'section', className, children, ...props }: SectionProps) {
  const Component = as;

  return (
    <Component className={cn('ds-section', className)} {...props}>
      {kicker || title || subtitle ? (
        <header className="ds-section__header">
          {kicker ? <p className="ds-kicker">{kicker}</p> : null}
          {title ? <h2 className="ds-title">{title}</h2> : null}
          {subtitle ? <p className="ds-subtitle">{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </Component>
  );
}
