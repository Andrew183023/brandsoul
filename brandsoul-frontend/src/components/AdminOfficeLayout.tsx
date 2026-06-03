import React, { type ReactNode } from 'react'

void React
import AdminShell from '../app/shells/AdminShell'

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
  const mappedSection = section === 'casos' ? 'cases' : 'operation'

  return (
    <AdminShell entityId={officeId} section={mappedSection} title={title} subtitle={subtitle}>
      {children}
    </AdminShell>
  )
}
