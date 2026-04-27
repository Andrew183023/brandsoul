import type { ReactNode } from 'react'

import './designSystem.css'

type FeedbackBannerProps = {
  children: ReactNode
  tone?: 'info' | 'error' | 'success' | 'warning'
  className?: string
}

export default function FeedbackBanner({ children, tone = 'info', className }: FeedbackBannerProps) {
  return (
    <div className={['feedback-banner', `feedback-banner--${tone}`, className].filter(Boolean).join(' ')} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}