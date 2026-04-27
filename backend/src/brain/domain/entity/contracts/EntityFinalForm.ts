export type EntityFinalForm = {
	identity?: {
		name?: string
		socialLine?: string
		openingLine?: string
		manifesto?: string
		archetype?: string
		toneKeywords?: string[]
		[key: string]: unknown
	}
	shape: {
		opacity: number
		edgeContrast: number
		intensity: number
		[key: string]: unknown
	}
	core: {
		scale: number
		opacity: number
		intensity: number
		internalPresence: number
		[key: string]: unknown
	}
	field: {
		spread: number
		opacity: number
		intensity: number
		blur: number
		[key: string]: unknown
	}
	particles: {
		budget: 'none' | 'low' | 'medium' | 'high'
		opacity: number
		size: number
		intensity: number
		spread: number
		[key: string]: unknown
	}
	silhouetteClarity?: 'low' | 'medium' | 'high'
	presenceMode?: string
	edgeStrength?: number
	locked?: boolean
	layerVisibility?: Record<string, unknown>
	[key: string]: unknown
}