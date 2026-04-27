import type { ReactNode } from 'react'
import AdminShell from '../app/shells/AdminShell'

export default function AdminEntityLayout({
  entityId,
  section,
  title,
  subtitle,
  children,
}: {
  entityId: string
  section: 'identity' | 'operation' | 'interaction' | 'intelligence' | 'runtime' | 'cases'
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <AdminShell entityId={entityId} section={section} title={title} subtitle={subtitle}>
      {children}
    </AdminShell>
  )
}
