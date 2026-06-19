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
  section: 'visao-geral' | 'casos' | 'triagem' | 'equipe' | 'cobertura' | 'disponibilidade' | 'perfil-publico' | 'publicacao' | 'crescimento' | 'configuracoes'
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <AdminShell
      officeId={officeId}
      officeName={officeId}
      section={section}
      title={title}
      subtitle={subtitle}
    >
      {children}
    </AdminShell>
  )
}
