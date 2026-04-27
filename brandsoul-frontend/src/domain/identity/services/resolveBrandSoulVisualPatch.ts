import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import type { BrandSoulDecision } from '../contracts/BrandSoulDecision'
import type { BrandSoulState } from '../contracts/BrandSoulState'
import type { BrandSoulVisualRuntimePatch } from '../../rendering/contracts/BrandSoulVisualRuntimePatch'
import { buildBrandSoulVisualRuntimePatch } from './buildBrandSoulVisualRuntimePatch'
import { mapCognitiveToVisualState, type BrandSoulVisualState } from './mapCognitiveToVisualState'
import { resolveBrandSoulDecision } from './resolveBrandSoulResponse'

export type BrandSoulVisualPatchResolution = {
  decision: BrandSoulDecision
  visualState: BrandSoulVisualState
  runtimePatch: BrandSoulVisualRuntimePatch
}

export function resolveBrandSoulVisualPatch(args: {
  context: BrandSoulContext
  userMessage: string
  currentState: BrandSoulState
}): BrandSoulVisualPatchResolution {
  const { context, userMessage, currentState } = args
  const decision = resolveBrandSoulDecision(context, userMessage)
  const visualState = mapCognitiveToVisualState(currentState, decision.intent, decision.action)
  const runtimePatch = buildBrandSoulVisualRuntimePatch({
    decision,
    visualState,
    currentState,
  })

  return {
    decision,
    visualState,
    runtimePatch,
  }
}