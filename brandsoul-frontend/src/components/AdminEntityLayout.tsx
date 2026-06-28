import React, { type ReactNode } from 'react'

void React
import AdminShell from '../app/shells/AdminShell'



type AdminEntityLayoutSection = 'identity' | 'operation' | 'interaction' | 'intelligence' | 'runtime' | 'cases'

function mapEntitySectionToShellSection(section: AdminEntityLayoutSection) {
  switch (section) {
    case 'cases':
      return 'casos'
    case 'identity':
      return 'perfil-publico'
    case 'operation':
      return 'visao-geral'
    case 'interaction':
      return 'triagem'
    case 'intelligence':
      return 'crescimento'
    case 'runtime':
      return 'configuracoes'
  }
}

export default function AdminEntityLayout({
  entityId,
  section,
  title,
  subtitle,
  children,
}: {
  entityId: string
  section: AdminEntityLayoutSection
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <AdminShell officeId={entityId} section={mapEntitySectionToShellSection(section)} title={title} subtitle={subtitle}>
      {children}
    </AdminShell>
  )
}
