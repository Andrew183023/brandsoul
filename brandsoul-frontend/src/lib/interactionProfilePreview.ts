export interface BusinessProfile {
  business_type: 'service' | 'product' | 'industry' | 'unknown'
  sector: 'food' | 'retail' | 'health' | 'tech' | 'industrial' | 'logistics' | 'general'
  model: 'b2c' | 'b2b' | 'hybrid' | 'unknown'
  complexity: 'low' | 'medium' | 'high'
}

function normalizePreviewText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokenizePreviewText(value: string) {
  return normalizePreviewText(value).split(/[^a-z0-9]+/).filter(Boolean)
}

function containsPreviewKeyword(description: string, keywords: string[]) {
  const normalizedDescription = normalizePreviewText(description)
  const tokens = tokenizePreviewText(description)

  return keywords.some((keyword) => {
    if (keyword.includes(' ')) {
      return normalizedDescription.includes(keyword)
    }

    return tokens.includes(keyword)
  })
}

export function inferInteractionProfilePreview(description: string): BusinessProfile {
  const fallbackProfile: BusinessProfile = {
    business_type: 'unknown',
    sector: 'general',
    model: 'unknown',
    complexity: 'medium',
  }

  if (!description.trim()) {
    return fallbackProfile
  }

  const foodKeywords = ['restaurante', 'comida', 'lanche', 'sushi', 'cafeteria', 'hamburguer', 'confeitaria', 'gastronomia']
  const retailKeywords = ['loja', 'roupa', 'vende', 'ecommerce', 'acessorio', 'produto', 'varejo', 'moda']
  const healthKeywords = ['clinica', 'odontologia', 'medico', 'saude', 'consultorio', 'estetica', 'laboratorio']
  const techKeywords = ['software', 'plataforma', 'sistema', 'aplicativo', 'tecnologia', 'saas', 'ia']
  const industryKeywords = ['fabrica', 'producao', 'industrial', 'industria', 'manufatura']
  const logisticsKeywords = ['delivery', 'entrega', 'entregas', 'logistica', 'motoboy', 'frete']
  const b2bKeywords = ['empresa', 'empresas', 'negocios', 'corporativo', 'industria', 'distribuidor', 'consultoria', 'parceiros']
  const b2cKeywords = ['cliente final', 'consumidor', 'pessoas', 'familias', 'varejo', 'cardapio']

  if (containsPreviewKeyword(description, foodKeywords)) {
    return {
      business_type: 'service',
      sector: 'food',
      model: 'b2c',
      complexity: 'low',
    }
  }

  if (containsPreviewKeyword(description, logisticsKeywords)) {
    return {
      business_type: 'service',
      sector: 'logistics',
      model: 'b2b',
      complexity: 'medium',
    }
  }

  if (containsPreviewKeyword(description, retailKeywords)) {
    return {
      business_type: 'product',
      sector: 'retail',
      model: 'b2c',
      complexity: 'low',
    }
  }

  if (containsPreviewKeyword(description, healthKeywords)) {
    return {
      business_type: 'service',
      sector: 'health',
      model: 'b2c',
      complexity: 'medium',
    }
  }

  if (containsPreviewKeyword(description, industryKeywords)) {
    return {
      business_type: 'industry',
      sector: 'industrial',
      model: 'b2b',
      complexity: 'high',
    }
  }

  if (containsPreviewKeyword(description, techKeywords)) {
    return {
      business_type: 'service',
      sector: 'tech',
      model: 'hybrid',
      complexity: 'high',
    }
  }

  if (containsPreviewKeyword(description, ['consultoria', 'consultor', 'agencia', 'estudio', 'studio', 'branding', 'design'])) {
    return {
      business_type: 'service',
      sector: 'general',
      model: 'b2b',
      complexity: 'medium',
    }
  }

  const model = containsPreviewKeyword(description, b2bKeywords)
    ? 'b2b'
    : containsPreviewKeyword(description, b2cKeywords)
      ? 'b2c'
      : 'unknown'

  return {
    ...fallbackProfile,
    model,
  }
}
