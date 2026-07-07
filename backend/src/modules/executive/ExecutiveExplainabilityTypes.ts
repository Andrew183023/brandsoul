export type ExecutiveExplainabilitySubject =
  | 'office_health'
  | 'recommendation'
  | 'opportunity'
  | 'alert'
  | 'decision'

export interface ExecutiveExplanationEvidence {
  key: string
  label: string
  value?: string | number | boolean | null
  impact?: 'positive' | 'neutral' | 'negative'
  summary: string
}

export interface ExecutiveExplanation {
  subject: ExecutiveExplainabilitySubject
  title: string
  summary: string
  reasons: string[]
  evidence: ExecutiveExplanationEvidence[]
}

export interface ExecutiveExplainOfficeHealthInput {
  score: number
  level: 'excellent' | 'good' | 'attention' | 'critical'
  drivers: Array<{
    key: string
    title: string
    impact: 'positive' | 'neutral' | 'negative'
    weight: number
    summary: string
  }>
}

export interface ExecutiveExplainRecommendationInput {
  id: string
  title?: string
  description?: string
  priority?: string
  expectedImpact?: string
  evidence?: string[]
}

export interface ExecutiveExplainOpportunityInput {
  id: string
  title?: string
  region?: string
  specialty?: string
  priority?: string
  expectedImpact?: string
  evidence?: string[]
}
