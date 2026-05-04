export type EntityManifestation = {
	mode?: string
	variant?: string
	intensity?: string
	spec?: {
		runtime?: {
			defaultVisual: {
				accent: string
				secondarySource?: 'primary' | 'secondary'
			}
			variantOverrides?: Record<string, {
				visual?: {
					accent?: string
					secondarySource?: 'primary' | 'secondary'
				}
				particleByIntensity?: Record<string, {
					emitterConfig?: Record<string, unknown>
					[key: string]: unknown
				}>
			}>
			particleByIntensity?: Record<string, {
				emitterConfig?: Record<string, unknown>
				[key: string]: unknown
			}>
		}
		motion?: {
			speed: number
			[key: string]: unknown
		}
	}
	artDirection?: {
		shapeFillStrategy?: string
		shapeRelation?: string
		[key: string]: unknown
	}
	birthTimeline?: {
		duration?: number
		stages?: Array<Record<string, unknown>>
		[key: string]: unknown
	}
	[key: string]: unknown
}