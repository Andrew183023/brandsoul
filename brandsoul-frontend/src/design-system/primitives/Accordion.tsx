import { useState, type ReactNode } from 'react';

type AccordionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function Accordion({ title, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="ds-accordion">
      <button
        type="button"
        className="ds-accordion__trigger"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {title}
      </button>
      {open ? <div className="ds-accordion__content">{children}</div> : null}
    </section>
  );
}
