import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import { Button } from './Button';

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ open, title, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const previousFocusedRef = useRef<HTMLElement | null>(null)
  const titleId = useMemo(() => `ds-modal-title-${Math.random().toString(36).slice(2, 10)}`, [])

  useEffect(() => {
    if (!open) {
      return
    }

    previousFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const container = dialogRef.current
    if (!container) {
      return
    }

    const selector = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(selector))
    const first = focusable[0] ?? container
    first.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const current = document.activeElement as HTMLElement | null
      const firstItem = focusable[0]
      const lastItem = focusable[focusable.length - 1]

      if (event.shiftKey && current === firstItem) {
        event.preventDefault()
        lastItem.focus()
        return
      }

      if (!event.shiftKey && current === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previousFocusedRef.current?.focus()
    }
  }, [onClose, open])

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="ds-overlay" onClick={onClose} aria-hidden="true" />
      <section ref={dialogRef} className="ds-modal motion-modal-continuity" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="ds-row" style={{ justifyContent: 'space-between' }}>
          <h2 className="ds-title" id={titleId}>{title}</h2>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
        {children}
      </section>
    </>
  );
}
