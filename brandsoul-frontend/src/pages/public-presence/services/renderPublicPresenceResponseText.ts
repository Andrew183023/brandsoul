import type { BrandSoulDecision } from '../../../domain/identity/contracts/BrandSoulDecision'

export function renderPublicPresenceResponseText(entityName: string, decision: BrandSoulDecision) {
  const mainFact = decision.responsePlan.requiredData[0]

  if (decision.action === 'refuse') {
    return `${entityName} mantem a presenca dentro de um limite seguro. ${decision.responsePlan.constraints?.[0] ?? ''}`.trim()
  }

  if (decision.action === 'sell') {
    return `${entityName} intensifica a presenca para conversao em torno de ${decision.responsePlan.topic}. ${decision.responsePlan.optionalCloseStyle === 'explore-promotion' ? 'Vou aproximar a conversa da proxima acao.' : ''}`.trim()
  }

  if (decision.action === 'support') {
    return `${entityName} responde com contencao e clareza sobre ${decision.responsePlan.topic}. ${mainFact ?? ''}`.trim()
  }

  if (decision.action === 'guide') {
    return `${entityName} reorganiza a presenca para orientar a proxima leitura. ${decision.responsePlan.topic}.`
  }

  return `${entityName} ajusta a presenca em torno de ${decision.responsePlan.topic}. ${mainFact ?? ''}`.trim()
}