import React, { type ElementType, type ReactNode } from 'react'

import FeedbackBanner from '../components/FeedbackBanner'
import SurfaceCard from '../components/SurfaceCard'

void React

type CardProps = {
  as?: ElementType
  className?: string
  children: ReactNode
  ['aria-label']?: string
}

export function Card({ as: Component = 'div', className, children, ...rest }: CardProps) {
  return (
    <SurfaceCard as={Component} className={className} {...rest}>
      {children}
    </SurfaceCard>
  )
}

export function Alert(props: {
  tone?: 'warning' | 'error' | 'neutral'
  title?: string
  description?: string
}) {
  const tone = props.tone === 'error' ? 'error' : props.tone === 'warning' ? 'warning' : 'info'
  return (
    <FeedbackBanner tone={tone}>
      {props.title ? <strong>{props.title}</strong> : null}
      {props.title && props.description ? ' ' : null}
      {props.description ?? null}
    </FeedbackBanner>
  )
}

export function Skeleton({ height = '6rem' }: { height?: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height,
        width: '100%',
        borderRadius: '1.25rem',
        background: 'linear-gradient(90deg, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0.16) 50%, rgba(15,23,42,0.08) 100%)',
      }}
    />
  )
}

export function Section(props: {
  kicker?: string
  title: string
  subtitle?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={props.className}>
      <header className="client-portal-page__section-header">
        {props.kicker ? <p className="client-portal-page__eyebrow">{props.kicker}</p> : null}
        <h1>{props.title}</h1>
        {props.subtitle ? <p className="client-portal-page__section-subtitle">{props.subtitle}</p> : null}
      </header>
      {props.children}
    </section>
  )
}
