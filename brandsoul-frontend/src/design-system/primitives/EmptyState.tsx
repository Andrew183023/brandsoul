import type { ReactNode } from 'react';

import { Button } from './Button';

type EmptyStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  continuityLabel?: string;
  recoveryLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  guidance?: string[];
  icon?: ReactNode;
};

export function EmptyState({
  eyebrow,
  title,
  description,
  continuityLabel,
  recoveryLabel,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  guidance,
  icon,
}: EmptyStateProps) {
  return (
    <section className="ds-empty-state ds-feedback-surface" aria-live="polite">
      {icon}
      {eyebrow ? <p className="ds-empty-state__eyebrow">{eyebrow}</p> : null}
      <h3 className="ds-title">{title}</h3>
      <p className="ds-subtitle">{description}</p>
      {continuityLabel ? <p className="ds-empty-state__continuity">O que você ainda pode fazer: {continuityLabel}</p> : null}
      {guidance && guidance.length > 0 ? (
        <ul className="ds-empty-state__guidance">
          {guidance.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {recoveryLabel ? <p className="ds-empty-state__recovery">{recoveryLabel}</p> : null}
      {actionLabel && onAction ? (
        <div className="ds-empty-state__actions">
          <Button onClick={onAction}>{actionLabel}</Button>
          {secondaryActionLabel && onSecondaryAction ? (
            <Button variant="secondary" onClick={onSecondaryAction}>{secondaryActionLabel}</Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
