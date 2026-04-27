import type { ReactNode } from 'react'

import StatusChip from '../../components/StatusChip'
import '../styles/caseShell.css'

type CaseShellProps = {
  statusLabel: string
  statusClassName?: string
  title: string
  subtitle?: string
  headerActions?: ReactNode
  details?: ReactNode
  thread: ReactNode
  composer?: ReactNode
  feedback?: ReactNode
}

export default function CaseShell({
  statusLabel,
  statusClassName,
  title,
  subtitle,
  headerActions,
  details,
  thread,
  composer,
  feedback,
}: CaseShellProps) {
  return (
    <main className="case-shell">
      <header className="case-shell__header">
        <div className="case-shell__header-copy">
          <StatusChip className={statusClassName ?? 'case-shell__status'}>{statusLabel}</StatusChip>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {headerActions ? <div className="case-shell__header-actions">{headerActions}</div> : null}
      </header>

      {feedback ? <section className="case-shell__feedback">{feedback}</section> : null}

      <div className={`case-shell__layout ${details ? 'case-shell__layout--with-details' : ''}`}>
        <section className="case-shell__thread-panel">
          <div className="case-shell__thread-scroll">
            {thread}
          </div>
          {composer ? <div className="case-shell__composer">{composer}</div> : null}
        </section>

        {details ? (
          <aside className="case-shell__details">
            {details}
          </aside>
        ) : null}
      </div>
    </main>
  )
}
