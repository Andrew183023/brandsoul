import type { PropsWithChildren, ReactNode } from 'react'

import {
  classifyTruthType,
  readFrontendTruthContract,
  resolveTruthLabel,
  type FrontendTruthContract,
  type FrontendTruthEnvelope,
  type FrontendTruthType,
} from './truthContract'

type TruthSeverity = 'info' | 'warning' | 'danger'

type TruthWarning = {
  id: string
  label: string
  detail: string
  severity: TruthSeverity
}

type UseTruthSurfaceOptions = {
  sourceLabel: string
  envelope?: FrontendTruthEnvelope | null
  fallbackStatus?: string
  backendUnavailable?: boolean
  localFallback?: boolean
  projectionOnly?: boolean
  advisoryOnly?: boolean
}

type TruthSurfaceState = {
  contract?: FrontendTruthContract
  truthType: FrontendTruthType
  truthLabel: string
  confidence: number
  warnings: TruthWarning[]
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function toSeverityClass(severity: TruthSeverity) {
  if (severity === 'danger') {
    return 'truth-warning--danger'
  }

  if (severity === 'warning') {
    return 'truth-warning--warning'
  }

  return 'truth-warning--info'
}

function toTruthBadgeClass(truthType: FrontendTruthType) {
  if (truthType === 'AUTHORITATIVE') return 'truth-badge--authoritative'
  if (truthType === 'ADVISORY') return 'truth-badge--advisory'
  if (truthType === 'PROJECTED') return 'truth-badge--projected'
  return 'truth-badge--synthetic'
}

function toTruthIcon(truthType: FrontendTruthType) {
  if (truthType === 'AUTHORITATIVE') return '🟢'
  if (truthType === 'ADVISORY') return '🟡'
  if (truthType === 'PROJECTED') return '🟠'
  return '🔴'
}

export function resolveTruthSurface(options: UseTruthSurfaceOptions): TruthSurfaceState {
  const contract = options.envelope ? readFrontendTruthContract(options.envelope) : undefined
  const truthType = classifyTruthType(contract)
  const warnings: TruthWarning[] = []

  if (!contract) {
    warnings.push({
      id: 'missing-contract',
      label: 'Missing truth contract',
      detail: `${options.sourceLabel} has no truthContract metadata. Treat as non-authoritative synthetic surface.`,
      severity: 'danger',
    })
  }

  if (options.backendUnavailable) {
    warnings.push({
      id: 'backend-unavailable',
      label: 'Backend unavailable',
      detail: 'Backend transport failed or timed out. Frontend must not present this state as authoritative.',
      severity: 'danger',
    })
  }

  if (options.localFallback) {
    warnings.push({
      id: 'local-fallback',
      label: 'Local fallback active',
      detail: 'A frontend fallback path is active. Causality and lineage are incomplete by definition.',
      severity: 'warning',
    })
  }

  if (options.projectionOnly || contract?.projected) {
    warnings.push({
      id: 'projection-only',
      label: 'Projection-only surface',
      detail: 'Projection summarizes state and must not be interpreted as direct runtime authority.',
      severity: 'warning',
    })
  }

  if (options.advisoryOnly || contract?.advisory) {
    warnings.push({
      id: 'advisory-only',
      label: 'Advisory-only surface',
      detail: 'This surface is observational and interpretive; it does not actuate runtime.',
      severity: 'info',
    })
  }

  if (contract?.synthetic) {
    warnings.push({
      id: 'synthetic-warning',
      label: 'Synthetic warning',
      detail: 'Synthetic content is present. Do not treat inferred outputs as institutional facts.',
      severity: 'danger',
    })
  }

  if (options.fallbackStatus) {
    warnings.push({
      id: 'fallback-status',
      label: 'Fallback status',
      detail: options.fallbackStatus,
      severity: 'warning',
    })
  }

  return {
    contract,
    truthType,
    truthLabel: resolveTruthLabel(truthType),
    confidence: contract?.confidence ?? 0,
    warnings,
  }
}

export function TruthBadge(props: {
  truthType: FrontendTruthType
  label?: string
}) {
  return (
    <span className={`truth-badge ${toTruthBadgeClass(props.truthType)}`}>
      <span aria-hidden>{toTruthIcon(props.truthType)}</span>
      <span>{props.label ?? resolveTruthLabel(props.truthType)}</span>
    </span>
  )
}

export function TruthMetaBar(props: {
  sourceLabel: string
  state: TruthSurfaceState
  fallbackStatus?: string
}) {
  const contract = props.state.contract

  return (
    <section className="truth-meta-bar" aria-label={`${props.sourceLabel} truth metadata`}>
      <div className="truth-meta-bar__header">
        <TruthBadge truthType={props.state.truthType} />
        <strong>{props.sourceLabel}</strong>
      </div>
      <div className="truth-meta-grid">
        <div>
          <span className="truth-meta-key">truth source</span>
          <span className="truth-meta-value">{contract?.sourceService ?? 'missing'}</span>
        </div>
        <div>
          <span className="truth-meta-key">confidence</span>
          <span className="truth-meta-value">{formatPercent(props.state.confidence)}</span>
        </div>
        <div>
          <span className="truth-meta-key">causality level</span>
          <span className="truth-meta-value">{contract?.causalityLevel ?? 'UNKNOWN'}</span>
        </div>
        <div>
          <span className="truth-meta-key">fallback status</span>
          <span className="truth-meta-value">{props.fallbackStatus ?? 'none'}</span>
        </div>
        <div>
          <span className="truth-meta-key">replay-safe status</span>
          <span className="truth-meta-value">{contract?.replaySafe ? 'true' : 'false'}</span>
        </div>
        <div>
          <span className="truth-meta-key">synthetic warning</span>
          <span className="truth-meta-value">{contract?.synthetic ? 'ACTIVE' : 'none'}</span>
        </div>
      </div>
    </section>
  )
}

export function TruthWarningBanners(props: {
  warnings: TruthWarning[]
  extraWarning?: ReactNode
}) {
  if (props.warnings.length === 0 && !props.extraWarning) {
    return null
  }

  return (
    <section className="truth-warning-stack" aria-label="truth warnings">
      {props.warnings.map((warning) => (
        <article key={warning.id} className={`truth-warning ${toSeverityClass(warning.severity)}`}>
          <strong>{warning.label}</strong>
          <p>{warning.detail}</p>
        </article>
      ))}
      {props.extraWarning ? <div>{props.extraWarning}</div> : null}
    </section>
  )
}

export function TruthSurfaceGuard(props: PropsWithChildren<{
  sourceLabel: string
  state: TruthSurfaceState
  fallbackStatus?: string
}>) {
  return (
    <>
      <TruthMetaBar sourceLabel={props.sourceLabel} state={props.state} fallbackStatus={props.fallbackStatus} />
      <TruthWarningBanners warnings={props.state.warnings} />
      {props.children}
    </>
  )
}
