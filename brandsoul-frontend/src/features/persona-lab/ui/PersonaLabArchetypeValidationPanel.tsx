import type { ReactNode } from 'react'

import type { VisualArchetype } from '../../../domain/visual-archetype/contracts/VisualArchetype'
import type { VisualBodyPlan } from '../../../domain/visual-archetype/contracts/VisualBodyPlan'
import type { CanonicalWeightProfile } from '../../../domain/visual-archetype/services/buildVisualBody'
import type { ArchetypeValidationFixture } from '../dev/archetypeValidationFixtures'

export type ArchetypeValidationCase = {
  fixture: ArchetypeValidationFixture
  actualBodyType: VisualArchetype['bodyType']
  silhouetteStrategy: VisualArchetype['silhouetteStrategy']
  weights: CanonicalWeightProfile
  legibility: number
  visualBodyPlan: VisualBodyPlan
  render: ReactNode
}

type PersonaLabArchetypeValidationPanelProps = {
  cases: ArchetypeValidationCase[]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatPoint(point: { x: number; y: number }) {
  return `${point.x.toFixed(0)}, ${point.y.toFixed(0)}`
}

function resolveAnchorTone(role: VisualBodyPlan['structure']['anchors'][number]['role']) {
  if (role === 'core') {
    return 'core'
  }
  if (role === 'axis') {
    return 'axis'
  }
  if (role === 'emission') {
    return 'emission'
  }
  return 'edge'
}

export function PersonaLabArchetypeValidationPanel({ cases }: PersonaLabArchetypeValidationPanelProps) {
  if (!import.meta.env.DEV || !cases.length) {
    return null
  }

  return (
    <section className="persona-lab-archetype-validation-panel">
      <div className="persona-lab-comparison-copy">
        <span className="professional-label">Archetype Validation Battery</span>
        <strong>5 categorias fortes • inputs variados • leitura em pausa</strong>
        <p>
          Compare os casos em shape-only para validar categoria imediata, força de silhueta e dependência residual do input cru antes de endurecer anchors.
        </p>
      </div>

      <div className="persona-lab-archetype-checklist">
        <span>Observe: reconhecimento imediato da categoria</span>
        <span>Observe: força da silhueta em pausa</span>
        <span>Observe: parentesco excessivo entre categorias</span>
        <span>Observe: quanto do input cru ainda domina o corpo</span>
        <span>Observe: se anchors, segments e cavities contam a mesma categoria</span>
      </div>

      <div className="persona-lab-archetype-validation-grid">
        {cases.map((item) => (
          <ArchetypeValidationCard key={item.fixture.id} item={item} />
        ))}
      </div>
    </section>
  )
}

function ArchetypeValidationCard({ item }: { item: ArchetypeValidationCase }) {
  const bounds = item.visualBodyPlan.silhouette.boundingBox
  const framePad = Math.max(Math.max(bounds.width, bounds.height) * 0.08, 12)

  return (
    <article className="persona-lab-archetype-card">
      <div className="persona-lab-archetype-card__header">
        <div>
          <span className="professional-label">{item.fixture.label}</span>
          <strong>{item.actualBodyType}</strong>
        </div>
        <span className={`persona-lab-archetype-badge ${item.actualBodyType === item.fixture.expectedBodyType ? 'match' : 'mismatch'}`}>
          {item.fixture.expectedBodyType} esperado
        </span>
      </div>

      <div className="persona-lab-archetype-card__preview-grid">
        <div className="persona-lab-archetype-card__logo-shell">
          <img src={item.fixture.logoPreview} alt={`Fixture ${item.fixture.label}`} className="persona-lab-logo-image compact" />
        </div>
        <div className="persona-lab-archetype-card__runtime">{item.render}</div>
      </div>

      <div className="persona-lab-archetype-card__anatomy-grid">
        <div className="persona-lab-archetype-card__anatomy-view">
          <svg
            viewBox={`${bounds.minX - framePad} ${bounds.minY - framePad} ${bounds.width + framePad * 2} ${bounds.height + framePad * 2}`}
            className="persona-lab-archetype-anatomy-svg"
            aria-label={`Anatomia ${item.fixture.label}`}
          >
            <rect
              x={bounds.minX}
              y={bounds.minY}
              width={bounds.width}
              height={bounds.height}
              rx={Math.min(bounds.width, bounds.height) * 0.08}
              className="persona-lab-archetype-anatomy-bounds"
            />
            <path d={item.visualBodyPlan.silhouette.envelopePath} vectorEffect="non-scaling-stroke" className="persona-lab-archetype-anatomy-envelope" />
            {item.visualBodyPlan.structure.cavities.map((cavity) => {
              return (
                <ellipse
                  key={cavity.id}
                  cx={cavity.center.x}
                  cy={cavity.center.y}
                  rx={Math.max(cavity.radiusX, 2)}
                  ry={Math.max(cavity.radiusY, 2)}
                  className="persona-lab-archetype-anatomy-cavity"
                  style={{ opacity: clamp(cavity.weight, 0.28, 0.88) }}
                />
              )
            })}
            {item.visualBodyPlan.structure.segments.map((segment) => {
              return (
                <line
                  key={segment.id}
                  x1={segment.from.x}
                  y1={segment.from.y}
                  x2={segment.to.x}
                  y2={segment.to.y}
                  className="persona-lab-archetype-anatomy-segment"
                  style={{ opacity: clamp(segment.weight, 0.32, 0.9) }}
                />
              )
            })}
            {item.visualBodyPlan.structure.anchors.map((anchor) => {
              return (
                <circle
                  key={anchor.id}
                  cx={anchor.point.x}
                  cy={anchor.point.y}
                  r={anchor.role === 'core' ? Math.max(item.visualBodyPlan.core.radius * 0.18, 2.8) : 1.8 + anchor.weight * 1.4}
                  className={`persona-lab-archetype-anatomy-anchor ${resolveAnchorTone(anchor.role)}`}
                />
              )
            })}
            <circle
              cx={item.visualBodyPlan.core.position.x}
              cy={item.visualBodyPlan.core.position.y}
              r={Math.max(item.visualBodyPlan.core.radius, 4)}
              className="persona-lab-archetype-anatomy-core"
            />
          </svg>

          <div className="persona-lab-archetype-anatomy-legend">
            <span>core</span>
            <span>axis</span>
            <span>edge</span>
            <span>emission</span>
            <span>cavity</span>
            <span>segment</span>
          </div>
        </div>

        <div className="persona-lab-archetype-card__anatomy-panel">
          <strong>Anatomia interna</strong>
          <div className="persona-lab-archetype-card__metrics persona-lab-archetype-card__metrics--dense">
            <span>core: {formatPoint(item.visualBodyPlan.core.position)}</span>
            <span>radius: {item.visualBodyPlan.core.radius.toFixed(1)}</span>
            <span>anchors: {item.visualBodyPlan.structure.anchors.length}</span>
            <span>segments: {item.visualBodyPlan.structure.segments.length}</span>
            <span>cavities: {item.visualBodyPlan.structure.cavities.length}</span>
            <span>bbox: {Math.round(bounds.width)}×{Math.round(bounds.height)}</span>
          </div>
          <div className="persona-lab-archetype-card__anatomy-roles">
            <span>axis {item.visualBodyPlan.structure.anchors.filter((anchor) => anchor.role === 'axis').length}</span>
            <span>edge {item.visualBodyPlan.structure.anchors.filter((anchor) => anchor.role === 'edge').length}</span>
            <span>emission {item.visualBodyPlan.structure.anchors.filter((anchor) => anchor.role === 'emission').length}</span>
          </div>
          <div className="persona-lab-archetype-card__anatomy-list">
            {item.visualBodyPlan.structure.anchors.slice(0, 6).map((anchor) => (
              <span key={anchor.id}>{anchor.id}: {anchor.role} · {formatPoint(anchor.point)}</span>
            ))}
          </div>
        </div>
      </div>

      <p className="persona-lab-archetype-card__summary">{item.fixture.summary}</p>

      <div className="persona-lab-archetype-card__chips">
        {item.fixture.inputTraits.map((trait) => (
          <span key={trait}>{trait}</span>
        ))}
      </div>

      <div className="persona-lab-archetype-card__metrics">
        <span>strategy: {item.silhouetteStrategy}</span>
        <span>legibility: {item.legibility.toFixed(2)}</span>
        <span>preserve: {item.weights.preserve.toFixed(2)}</span>
        <span>exaggerate: {item.weights.exaggerate.toFixed(2)}</span>
        <span>reconstruct: {item.weights.reconstruct.toFixed(2)}</span>
      </div>

      <div className="persona-lab-archetype-card__focus">
        {item.fixture.observationFocus.map((focus) => (
          <span key={focus}>{focus}</span>
        ))}
      </div>
    </article>
  )
}