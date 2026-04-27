import type { ElementType, ReactNode } from 'react'

import './designSystem.css'

type SurfaceCardProps = {
  as?: ElementType
  children: ReactNode
  className?: string
  tone?: 'admin' | 'public'
}

export default function SurfaceCard({
  as: Component = 'section',
  children,
  className,
  tone = 'admin',
}: SurfaceCardProps) {
  return <Component className={['surface-card', `surface-card--${tone}`, className].filter(Boolean).join(' ')}>{children}</Component>
}