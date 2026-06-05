import { useMemo, useState, type ReactNode } from 'react';

type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
};

type TabsProps = {
  items: TabItem[];
  defaultTabId?: string;
};

export function Tabs({ items, defaultTabId }: TabsProps) {
  const initial = useMemo(() => defaultTabId ?? items[0]?.id ?? '', [defaultTabId, items]);
  const [activeTab, setActiveTab] = useState(initial);

  if (items.length === 0) {
    return null;
  }

  const selected = items.find((item) => item.id === activeTab) ?? items[0]!;

  return (
    <section>
      <div className="ds-tabs" role="tablist" aria-label="Tabs">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected.id === item.id}
            className="ds-tab"
            onClick={() => setActiveTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" style={{ marginTop: 'var(--ds-space-3)' }}>
        {selected.content}
      </div>
    </section>
  );
}
