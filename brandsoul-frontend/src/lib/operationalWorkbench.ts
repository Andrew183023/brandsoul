type ForwardPayload = {
  destination: string
  note?: string
}

type EscalationPayload = {
  reason: string
  severity: 'alta' | 'moderada' | 'baixa'
}

function sanitizeSingleLine(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildPendingClientStatusMessage() {
  return '[STATUS] Caso movido para pendente-cliente: aguardando retorno documental do cliente para continuidade da triagem.'
}

export function buildForwardMessage(payload: ForwardPayload) {
  const destination = sanitizeSingleLine(payload.destination)
  const note = sanitizeSingleLine(payload.note ?? '')
  return note.length > 0
    ? `[ENCAMINHAMENTO] Destino: ${destination}. Nota operacional: ${note}`
    : `[ENCAMINHAMENTO] Destino: ${destination}. Encaminhado para tratativa interna.`
}

export function buildEscalationMessage(payload: EscalationPayload) {
  const reason = sanitizeSingleLine(payload.reason)
  return `[ESCALONAMENTO] Severidade: ${payload.severity}. Motivo: ${reason}`
}
