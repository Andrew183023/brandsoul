export type OnboardingFlowId = 'client-discovery' | 'office-setup' | 'operator-console'

export type OnboardingFlowState = {
  currentStep: number
  completedSteps: string[]
  dismissed: boolean
  firstSuccessAt?: string
  updatedAt: string
}

const STORAGE_PREFIX = 'brandsoul:onboarding:'

function getStorageKey(flowId: OnboardingFlowId) {
  return `${STORAGE_PREFIX}${flowId}`
}

function createDefaultState(): OnboardingFlowState {
  return {
    currentStep: 0,
    completedSteps: [],
    dismissed: false,
    updatedAt: new Date().toISOString(),
  }
}

function isValidState(value: unknown): value is OnboardingFlowState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<OnboardingFlowState>
  return typeof state.currentStep === 'number'
    && Array.isArray(state.completedSteps)
    && typeof state.dismissed === 'boolean'
    && typeof state.updatedAt === 'string'
}

export function readOnboardingFlowState(flowId: OnboardingFlowId): OnboardingFlowState {
  try {
    const raw = window.localStorage.getItem(getStorageKey(flowId))
    if (!raw) {
      return createDefaultState()
    }

    const parsed = JSON.parse(raw) as unknown
    if (!isValidState(parsed)) {
      return createDefaultState()
    }

    return parsed
  } catch {
    return createDefaultState()
  }
}

export function writeOnboardingFlowState(flowId: OnboardingFlowId, state: OnboardingFlowState) {
  const normalized: OnboardingFlowState = {
    ...state,
    currentStep: Math.max(0, Math.floor(state.currentStep)),
    completedSteps: [...new Set(state.completedSteps)],
    updatedAt: new Date().toISOString(),
  }

  window.localStorage.setItem(getStorageKey(flowId), JSON.stringify(normalized))
}

export function completeOnboardingStep(flowId: OnboardingFlowId, stepId: string, nextStep?: number) {
  const current = readOnboardingFlowState(flowId)
  const completedSteps = current.completedSteps.includes(stepId)
    ? current.completedSteps
    : [...current.completedSteps, stepId]

  writeOnboardingFlowState(flowId, {
    ...current,
    completedSteps,
    currentStep: typeof nextStep === 'number' ? Math.max(current.currentStep, nextStep) : current.currentStep,
  })
}

export function registerOnboardingFirstSuccess(flowId: OnboardingFlowId) {
  const current = readOnboardingFlowState(flowId)
  if (current.firstSuccessAt) {
    return
  }

  writeOnboardingFlowState(flowId, {
    ...current,
    firstSuccessAt: new Date().toISOString(),
  })
}

export function dismissOnboardingFlow(flowId: OnboardingFlowId) {
  const current = readOnboardingFlowState(flowId)
  writeOnboardingFlowState(flowId, {
    ...current,
    dismissed: true,
  })
}

export function clearOnboardingFlowState(flowId: OnboardingFlowId) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(getStorageKey(flowId))
}
