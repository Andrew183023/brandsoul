import type { ReactNode } from 'react'

import './designSystem.css'

export type StatusChipTone = 'neutral' | 'success' | 'danger' | 'warning'

type StatusChipProps = {
  children: ReactNode
  tone?: StatusChipTone
  className?: string
}

export default function StatusChip({ children, tone = 'neutral', className }: StatusChipProps) {
  return <span className={['status-chip', `status-chip--${tone}`, className].filter(Boolean).join(' ')}>{children}</span>
}