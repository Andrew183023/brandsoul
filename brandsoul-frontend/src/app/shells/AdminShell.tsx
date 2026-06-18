import React, { type ReactNode } from 'react'
import { LEGAL_ROUTES } from '../routes/legalRoutes'

void React

import '../styles/adminShell.css'

type AdminShellSection = 'visao-geral' | 'casos' | 'triagem' | 'equipe' | 'cobertura' | 'disponibilidade' | 'perfil-publico' | 'publicacao' | 'configuracoes'

type AdminShellProps = {
  officeId: string
  officeName?: string
  section: AdminShellSection
  title: string
  subtitle: string
  children: ReactNode
}

type NavItem = {
  id: 'visao-geral' | 'casos' | 'triagem' | 'equipe' | 'cobertura' | 'disponibilidade' | 'perfil-publico' | 'publicacao' | 'configuracoes'
  routeSection: 'visao-geral' | 'casos' | 'triagem' | 'equipe' | 'cobertura' | 'disponibilidade' | 'perfil-publico' | 'publicacao' | 'configuracoes'
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'visao-geral', routeSection: 'visao-geral', label: 'Visão Geral' },
  { id: 'casos', routeSection: 'casos', label: 'Casos' },
  { id: 'triagem', routeSection: 'triagem', label: 'Triagem' },
  { id: 'equipe', routeSection: 'equipe', label: 'Equipe' },
  { id: 'cobertura', routeSection: 'cobertura', label: 'Cobertura' },
  { id: 'disponibilidade', routeSection: 'disponibilidade', label: 'Disponibilidade' },
  { id: 'perfil-publico', routeSection: 'perfil-publico', label: 'Perfil Público' },
  { id: 'publicacao', routeSection: 'publicacao', label: 'Publicação' },
  { id: 'configuracoes', routeSection: 'configuracoes', label: 'Configurações' },
]

export default function AdminShell({
  officeId,
  officeName,
  section,
  title,
  subtitle,
  children,
}: AdminShellProps) {
  const resolvedOfficeLabel = officeName?.trim() || officeId
  const activeSection = section

  return (
    <main className="admin-office-shell">
      <aside className="admin-office-shell__sidebar">
        <a href="/admin" className="admin-office-shell__brand" aria-label="BrandSoul admin">
          <span className="admin-office-shell__brand-mark" aria-hidden="true">◌</span>
          <span className="admin-office-shell__brand-copy">
            <strong>BrandSoul</strong>
            <span>cabine do escritório</span>
          </span>
        </a>

        <div className="admin-office-shell__office-meta">
          <span className="admin-office-shell__office-kicker">escritório</span>
          <strong>{resolvedOfficeLabel}</strong>
          <span>{officeId}</span>
        </div>

        <nav className="admin-office-shell__nav" aria-label="Seções da cabine do escritório">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === activeSection

            return (
              <a
                key={item.id}
                href={LEGAL_ROUTES.admin.escritorio(officeId, item.routeSection)}
                className={`admin-office-shell__nav-link ${isActive ? 'admin-office-shell__nav-link--active' : ''}`}
              >
                <span>{item.label}</span>
              </a>
            )
          })}
        </nav>
      </aside>

      <div className="admin-office-shell__main">
        <header className="admin-office-shell__header">
          <div>
            <p className="admin-office-shell__kicker">comando da operação</p>
            <h1>{title}</h1>
            <p className="admin-office-shell__subtitle">{subtitle}</p>
          </div>

          <div className="admin-office-shell__header-actions">
            <a href="/admin" className="admin-office-shell__button admin-office-shell__button--ghost">
              Voltar ao admin
            </a>
            <a href={LEGAL_ROUTES.public.escritorioPerfil(officeId)} className="admin-office-shell__button">
              Ver público
            </a>
          </div>
        </header>

        <section className="admin-office-shell__content">
          {children}
        </section>
      </div>
    </main>
  )
}
