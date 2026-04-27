import type { ReactNode } from 'react'

import '../styles/adminShell.css'

type AdminShellSection = 'identity' | 'operation' | 'interaction' | 'intelligence' | 'runtime' | 'cases'

type AdminShellProps = {
  entityId: string
  entityName?: string
  section: AdminShellSection
  title: string
  subtitle: string
  children: ReactNode
}

type NavItem = {
  id: AdminShellSection
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'operation', label: 'Operation' },
  { id: 'interaction', label: 'Interaction' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'cases', label: 'Cases' },
]

export default function AdminShell({
  entityId,
  entityName,
  section,
  title,
  subtitle,
  children,
}: AdminShellProps) {
  const resolvedEntityLabel = entityName?.trim() || entityId

  return (
    <main className="entity-console-shell">
      <aside className="entity-console-shell__sidebar">
        <a href="/admin" className="entity-console-shell__brand" aria-label="BrandSoul admin">
          <span className="entity-console-shell__brand-mark" aria-hidden="true">◌</span>
          <span className="entity-console-shell__brand-copy">
            <strong>BrandSoul</strong>
            <span>entity console</span>
          </span>
        </a>

        <div className="entity-console-shell__entity-meta">
          <span className="entity-console-shell__entity-kicker">entidade</span>
          <strong>{resolvedEntityLabel}</strong>
          <span>{entityId}</span>
        </div>

        <nav className="entity-console-shell__nav" aria-label="Admin entity sections">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === section

            return (
              <a
                key={item.id}
                href={`/admin/entity/${entityId}/${item.id}`}
                className={`entity-console-shell__nav-link ${isActive ? 'entity-console-shell__nav-link--active' : ''}`}
              >
                {item.label}
              </a>
            )
          })}
        </nav>
      </aside>

      <div className="entity-console-shell__main">
        <header className="entity-console-shell__header">
          <div>
            <p className="entity-console-shell__kicker">console de direcao</p>
            <h1>{title}</h1>
            <p className="entity-console-shell__subtitle">{subtitle}</p>
          </div>

          <div className="entity-console-shell__header-actions">
            <a href="/admin" className="entity-console-shell__button entity-console-shell__button--ghost">
              Voltar ao admin
            </a>
            <a href={`/entity/${entityId}`} className="entity-console-shell__button">
              Ver publico
            </a>
          </div>
        </header>

        <section className="entity-console-shell__content">
          {children}
        </section>
      </div>
    </main>
  )
}
