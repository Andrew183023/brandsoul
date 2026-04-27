import type { PixiScenePerfSnapshot } from '../../../runtime/pixi/scene/PersonaScene'
import type { EntityProfile } from '../../../domain/entity/contracts/EntityProfile'
import type { PersonaLabRuntimeDebugState, PixiPerfScenario } from '../state/personaLabStore'

type PersonaLabDevPanelProps = {
  runtimeDebug: PersonaLabRuntimeDebugState
  runtimePerf: PixiScenePerfSnapshot | null
  entityProfile?: EntityProfile
  pixiPerfScenario: PixiPerfScenario
  toggleRuntimeDebug: (key: keyof PersonaLabRuntimeDebugState) => void
  setPixiPerfScenario: (scenario: PixiPerfScenario) => void
}

export function PersonaLabDevPanel({
  runtimeDebug,
  runtimePerf,
  entityProfile,
  pixiPerfScenario,
  toggleRuntimeDebug,
  setPixiPerfScenario,
}: PersonaLabDevPanelProps) {
  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <>
      <div className="persona-lab-dev-toggles">
        <button type="button" className={`chat-header-button subtle ${runtimeDebug.showComparison ? 'selected' : ''}`} onClick={() => toggleRuntimeDebug('showComparison')}>
          Compare 4 modos
        </button>
        <button type="button" className={`chat-header-button subtle ${runtimeDebug.showArchetypeValidation ? 'selected' : ''}`} onClick={() => toggleRuntimeDebug('showArchetypeValidation')}>
          Archetype battery
        </button>
        <button type="button" className={`chat-header-button subtle ${runtimeDebug.showShapeCompare ? 'selected' : ''}`} onClick={() => toggleRuntimeDebug('showShapeCompare')}>
          Shape compare
        </button>
        <button type="button" className={`chat-header-button subtle ${runtimeDebug.shapeOnlyMode ? 'selected' : ''}`} onClick={() => toggleRuntimeDebug('shapeOnlyMode')}>
          Shape Only
        </button>
        <button type="button" className={`chat-header-button subtle ${runtimeDebug.showField ? 'selected' : ''}`} onClick={() => toggleRuntimeDebug('showField')}>
          Field
        </button>
        <button type="button" className={`chat-header-button subtle ${runtimeDebug.showParticles ? 'selected' : ''}`} onClick={() => toggleRuntimeDebug('showParticles')}>
          Particles
        </button>
        <button type="button" className={`chat-header-button subtle ${runtimeDebug.showCore ? 'selected' : ''}`} onClick={() => toggleRuntimeDebug('showCore')}>
          Core
        </button>
        <button type="button" className={`chat-header-button subtle ${runtimeDebug.showDebug ? 'selected' : ''}`} onClick={() => toggleRuntimeDebug('showDebug')}>
          Overlay técnico
        </button>
        <button type="button" className={`chat-header-button subtle ${runtimeDebug.liteEffects ? 'selected' : ''}`} onClick={() => toggleRuntimeDebug('liteEffects')}>
          Lite FX
        </button>
        <span className="chat-header-button subtle selected" aria-label="Pixi runtime canônico">
          Pixi Runtime canônico
        </span>
      </div>

      {runtimePerf ? (
        <section className="persona-lab-runtime-perf-panel">
          <div className="persona-lab-runtime-perf-head">
            <span className="professional-label">Pixi Runtime Perf</span>
            <strong>{runtimePerf.stageId}</strong>
            <span>{runtimePerf.timelineActive ? 'birth active' : runtimePerf.finalReveal ? 'final reveal' : 'idle'}</span>
          </div>
          <div className="persona-lab-runtime-perf-scenarios">
            <button
              type="button"
              className={`chat-header-button subtle ${pixiPerfScenario === 'field-only' ? 'selected' : ''}`}
              onClick={() => setPixiPerfScenario('field-only')}
            >
              A · Field ON / Particles OFF
            </button>
            <button
              type="button"
              className={`chat-header-button subtle ${pixiPerfScenario === 'particles-only' ? 'selected' : ''}`}
              onClick={() => setPixiPerfScenario('particles-only')}
            >
              B · Field OFF / Particles ON
            </button>
            <button
              type="button"
              className={`chat-header-button subtle ${pixiPerfScenario === 'combined' ? 'selected' : ''}`}
              onClick={() => setPixiPerfScenario('combined')}
            >
              C · Field ON / Particles ON
            </button>
          </div>
          <div className="persona-lab-runtime-perf-grid">
            <div>
              <span className="professional-label">Frame</span>
              <strong>{runtimePerf.frameMs.toFixed(2)} ms</strong>
              <span>{runtimePerf.fps.toFixed(0)} fps</span>
            </div>
            <div>
              <span className="professional-label">Hot Layer</span>
              <strong>{runtimePerf.hottestLayer}</strong>
              <span>{runtimePerf.bottleneck}</span>
            </div>
            <div>
              <span className="professional-label">Context</span>
              <strong>{runtimePerf.intensity}</strong>
              <span>{runtimeDebug.liteEffects ? 'lite fx on' : 'lite fx off'} • {pixiPerfScenario}</span>
            </div>
            <div>
              <span className="professional-label">Layer Avg</span>
              <strong>
                S {runtimePerf.layers.shape.toFixed(2)} • C {runtimePerf.layers.core.toFixed(2)}
              </strong>
              <span>
                F {runtimePerf.layers.field.toFixed(2)} • P {runtimePerf.layers.particles.toFixed(2)} • T {runtimePerf.layers.timeline.toFixed(2)}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {entityProfile?.relational ? (
        <section className="persona-lab-runtime-perf-panel persona-lab-relational-dev-panel">
          <div className="persona-lab-runtime-perf-head">
            <span className="professional-label">Entity Relational State</span>
            <strong>{entityProfile.relational.behaviorState.relationshipMode}</strong>
            <span>
              {entityProfile.relational.behaviorState.engagementLevel} • {entityProfile.relational.hookLoop.loopCategory}
            </span>
          </div>
          <div className="persona-lab-runtime-perf-grid">
            <div>
              <span className="professional-label">Progress</span>
              <strong>Level {entityProfile.relational.progression.level}</strong>
              <span>
                {entityProfile.relational.progression.xp} XP • {entityProfile.relational.progression.evolutionStage}
              </span>
            </div>
            <div>
              <span className="professional-label">Affinity</span>
              <strong>{Math.round(entityProfile.relational.behaviorState.affinityScore * 100)}%</strong>
              <span>Loop {Math.round(entityProfile.relational.behaviorState.loopStrength * 100)}%</span>
            </div>
            <div>
              <span className="professional-label">Memory</span>
              <strong>{Math.round(entityProfile.relational.userMemory.memoryConfidence * 100)}%</strong>
              <span>{entityProfile.relational.userMemory.knownPreferences.length} prefs • {entityProfile.relational.userMemory.recurringTopics.length} recurring</span>
            </div>
            <div>
              <span className="professional-label">Hook</span>
              <strong>{Math.round(entityProfile.relational.hookLoop.returnProbability * 100)}%</strong>
              <span>{entityProfile.relational.hookLoop.triggerType} → {entityProfile.relational.hookLoop.rewardType}</span>
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
