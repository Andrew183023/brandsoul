export type EntityInput = {
  brand: {
    name: string
    [key: string]: unknown
  }
  context: {
    brandCategory?: string
    languageStyle?: string
    styleAnswers?: {
      languageStyle?: string
      actionStyle?: string
      brandStyle?: string
      tagline?: string
      manifesto?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  palette: {
    primary: string
    secondary?: string
    contrast?: 'high' | 'medium' | 'low'
    [key: string]: unknown
  }
}