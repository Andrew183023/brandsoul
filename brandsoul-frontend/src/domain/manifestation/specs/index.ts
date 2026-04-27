import type { ManifestationMode } from '../../rendering/contracts/types'
import type { ManifestationSpec } from '../contracts/ManifestationSpec'
import { centelhaSpec } from './centelha'
import { elementalSpec } from './elemental'
import { naturezaSpec } from './natureza'
import { roboSpec } from './roboIA'

export { centelhaSpec } from './centelha'
export { elementalSpec } from './elemental'
export { naturezaSpec } from './natureza'
export { roboSpec } from './roboIA'

export const manifestationSpecs: Record<ManifestationMode, ManifestationSpec> = {
  centelha: centelhaSpec,
  elemental: elementalSpec,
  natureza: naturezaSpec,
  'robo-ia': roboSpec,
}

export function getManifestationSpec(mode: ManifestationMode): ManifestationSpec {
  return manifestationSpecs[mode]
}
