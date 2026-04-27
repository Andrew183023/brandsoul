import type { ManifestationMode } from '../../rendering/contracts/types'

type ManifestationModeDefinition = {
  id: ManifestationMode
  label: string
  variants: Array<{
    id: string
    label: string
  }>
}

export const manifestationModes: ManifestationModeDefinition[] = [
  {
    id: 'centelha',
    label: 'Centelha',
    variants: [
      { id: 'fused-logo', label: 'Fused Logo' },
      { id: 'living-glow', label: 'Living Glow' },
      { id: 'inspired-shape', label: 'Inspired Shape' },
    ],
  },
  {
    id: 'elemental',
    label: 'Elemental',
    variants: [
      { id: 'fogo', label: 'Fogo' },
      { id: 'agua', label: 'Agua' },
      { id: 'terra', label: 'Terra' },
      { id: 'ar', label: 'Ar' },
    ],
  },
  {
    id: 'natureza',
    label: 'Natureza',
    variants: [
      { id: 'folhas', label: 'Folhas' },
      { id: 'semente', label: 'Semente' },
    ],
  },
  {
    id: 'robo-ia',
    label: 'Robo IA',
    variants: [
      { id: 'premium-tech', label: 'Premium Tech' },
      { id: 'default', label: 'Default' },
    ],
  },
]