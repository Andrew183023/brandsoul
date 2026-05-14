import type { EntityIntent } from '../domain/entity/contracts/EntityIntent.js'
import type { EntityProfile } from '../domain/entity/contracts/EntityProfile.js'
import { ensureCanonicalEntityIdentity } from '../../entities/identity/entityIdentityBuilder.js'

export function createContext(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    entityId: 'entity-test',
    userIntent: 'unknown',
    journeyMoment: 'birth',
    urgencyLevel: 'low',
    interactionType: 'message',
    observedAt: '2026-04-19T00:00:00.000Z',
    ...overrides,
  }
}

export function createIntent(args?: {
  entityId?: string
  type?: string
  confidence?: number
  createdAt?: string
  reason?: string
  context?: EntityIntent['context']
  [key: string]: unknown
}): EntityIntent {
  return {
    type: args?.type ?? 'engage',
    confidence: args?.confidence ?? 0.72,
    reason: args?.reason ?? 'test-intent',
    context: args?.context,
  }
}

export function createTestEntity(): EntityProfile {
  const now = '2026-04-19T12:00:00.000Z'

  const entity = {
    id: 'entity-test',
    schemaVersion: 1,
    source: 'backend-engine',
    brand: {
      name: 'Aurora',
    },
    context: {
      styleAnswers: {
        brandStyle: 'editorial',
        languageStyle: 'calmo',
        actionStyle: 'orientar',
      },
    },
    palette: {
      primary: '#ff7a59',
      secondary: '#0f172a',
      accent: '#ffd166',
    },
    social: {
      publicName: 'Aurora',
      handle: '@aurora',
    },
    export: {
      formatsEnabled: ['post', 'story', 'square'],
    },
    manifestation: {
      mode: 'natureza',
      variant: 'aurora',
      intensity: 'medium',
      spec: {
        runtime: {
          defaultVisual: {
            accent: '#ff7a59',
            secondarySource: 'secondary',
          },
          variantOverrides: {
            aurora: {
              visual: {
                accent: '#ff7a59',
                secondarySource: 'secondary',
              },
              particleByIntensity: {
                medium: {
                  emitterConfig: {
                    spread: 0.5,
                  },
                },
              },
            },
          },
          particleByIntensity: {
            medium: {
              emitterConfig: {
                spread: 0.5,
              },
            },
          },
        },
        motion: {
          speed: 1,
        },
      },
      artDirection: {
        shapeFillStrategy: 'gradient',
        shapeRelation: 'contained',
      },
      birthTimeline: {
        duration: 12000,
        stages: [
          { id: 'initial', label: 'Initial' },
          { id: 'mid', label: 'Mid' },
          { id: 'final', label: 'Final' },
        ],
      },
    },
    morphology: {
      archetype: 'signal',
    },
    behavior: {
      tone: 'guide',
    },
    relational: {
      behaviorState: {
        affinityScore: 0.58,
        loopStrength: 0.52,
        interactionCount: 3,
        relationshipMode: 'returning',
      },
      progression: {
        schemaVersion: 1,
        level: 2,
        xp: 24,
        refinementScore: 0.56,
        maturityStage: 'emerging',
        updatedAt: now,
        growthHistory: [],
      },
      userMemory: {
        schemaVersion: 1,
        knownPreferences: [],
        lastInteractions: [],
        recentInterests: ['presenca publica'],
        recurringTopics: ['clareza'],
        memoryConfidence: 0.42,
        lastSeenAt: now,
        lastActiveAt: now,
        updatedAt: now,
      },
      hookLoop: {
        reinforcementScore: 0.48,
        returnProbability: 0.51,
      },
      binding: {
        ownerId: 'user:1:tenant:1',
        createdAt: now,
        bindingStrength: 0.44,
        attachmentLevel: 'warming',
        identityImprintScore: 0.33,
        continuityScore: 0.41,
        exclusivityScore: 0.12,
        lastInteractionAt: now,
        updatedAt: now,
      },
      imprint: {
        signature: 'aurora-imprint',
      },
      timelineLog: {
        schemaVersion: 1,
        firstSeenAt: now,
        lastEventAt: now,
        totalActiveMs: 1200,
        returnCount: 1,
        interactionDiversity: 0.4,
        updatedAt: now,
        entries: [],
      },
      value: {
        score: 0.3,
      },
    },
    finalForm: {
      identity: {
        name: 'Aurora',
      },
      shape: {
        opacity: 0.82,
        edgeContrast: 0.6,
        intensity: 0.52,
      },
      core: {
        scale: 0.74,
        opacity: 0.7,
        intensity: 0.6,
        internalPresence: 0.48,
      },
      field: {
        spread: 0.58,
        opacity: 0.62,
        intensity: 0.55,
        blur: 0.3,
      },
      particles: {
        budget: 'medium',
        opacity: 0.64,
        size: 0.8,
        intensity: 0.7,
        spread: 0.65,
      },
      silhouetteClarity: 'high',
      presenceMode: 'stabilizing',
      edgeStrength: 0.58,
      locked: false,
      layerVisibility: {
        shape: true,
        core: true,
        field: true,
        particles: true,
      },
    },
    runtime: {
      control: {
        engine: 'visual',
        compareMode: false,
        playback: {
          playBirthTimeline: true,
          activeStage: 'initial',
        },
        layerVisibility: {
          shape: true,
          core: true,
          field: true,
          particles: true,
        },
        debugFlags: {
          shapeOnly: false,
        },
      },
      flowMind: {
        mode: 'shadow',
        updatedAt: now,
        publicPartial: {
          rolloutPercentage: 0,
          killSwitchEnabled: false,
          automationMode: 'recommendation-only',
          updatedAt: now,
        },
      },
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
      notes: [],
    },
  } as unknown as EntityProfile

  return ensureCanonicalEntityIdentity(entity, {
    tenantId: 1,
    createdAt: now,
    preserveEntityId: entity.id,
  })
}
