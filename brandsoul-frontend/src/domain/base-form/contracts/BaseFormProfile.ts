export type BaseFormFamily =
  | 'orb'
  | 'totem'
  | 'flare'
  | 'shard'
  | 'lattice'

export type BaseFormProfile = {
  family: BaseFormFamily
  spine: 'vertical' | 'horizontal' | 'radial'
  massDistribution: 'centered' | 'distributed' | 'asymmetric'
  edgeDiscipline: 'soft' | 'controlled' | 'sharp'
  openness: number
  bodyCompression: number
  corePlacement: {
    x: number
    y: number
  }
}