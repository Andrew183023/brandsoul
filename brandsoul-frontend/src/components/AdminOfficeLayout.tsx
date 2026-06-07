import React, { type ReactNode } from 'react'

void React

import { LEGAL_ROUTES } from '../app/routes/legalRoutes'

export default function AdminOfficeLayout({
  officeId,
  section,
  title,
  subtitle,
  children,
}: {
  officeId: string
  section: 'visao-geral' | 'casos' | 'triagem' | 'equipe' | 'cobertura' | 'disponibilidade' | 'perfil-publico' | 'publicacao' | 'configuracoes'
  title: string
  subtitle: string
  children: ReactNode
}) {
  const navItems = [
    { id: 'visao-geral', label: 'Visao geral' },
    { id: 'casos', label: 'Casos' },
    { id: 'triagem', label: 'Triagem' },
    { id: 'equipe', label: 'Equipe' },
    { id: 'cobertura', label: 'Cobertura' },
    { id: 'disponibilidade', label: 'Disponibilidade' },
    { id: 'perfil-publico', label: 'Perfil publico' },
    { id: 'publicacao', label: 'Publicacao' },
    { id: 'configuracoes', label: 'Configuracoes' },
  ] as const

  return (
    <main className="admin-shell">
      <section className="admin-panel">
        <div className="admin-header">
          <div>
            <p className="admin-kicker">admin juridico</p>
            <h1>{title}</h1>
            <p className="admin-subtitle">{subtitle}</p>
          </div>
          <div className="admin-actions">
            <a href="/admin" className="admin-button admin-button--ghost">Trocar escritorio</a>
            <a href={LEGAL_ROUTES.public.escritorioPerfil(officeId)} className="admin-button">Ver publico</a>
          </div>
        </div>

        <nav className="admin-actions" aria-label="Secoes do escritorio">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={LEGAL_ROUTES.admin.escritorio(officeId, item.id)}
              className={`admin-button ${item.id === section ? '' : 'admin-button--ghost'}`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {children}
      </section>
    </main>
  )
}
