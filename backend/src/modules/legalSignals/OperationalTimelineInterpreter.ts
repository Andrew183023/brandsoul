import type { OperationalTimelineEntry } from './OperationalTimeline.js'
import type { LegalOperationalSignal } from './signalTypes.js'

function readString(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function buildEntryId(signal: LegalOperationalSignal) {
  return [
    signal.tenantId,
    signal.entityId,
    signal.signalType,
    signal.source,
    signal.caseId ?? 'office',
    signal.occurredAt,
  ].join(':')
}

function buildTitleAndDescription(signal: LegalOperationalSignal) {
  const practiceArea = readString(signal.payload, 'practiceArea')
  const closureReason = readString(signal.payload, 'closureReason')
  const reassignmentReason = readString(signal.payload, 'reassignmentReason')
  const assignmentMode = readString(signal.payload, 'assignmentMode')
  const channel = readString(signal.payload, 'channel')
  const responseTimeMinutes = readNumber(signal.payload, 'responseTimeMinutes')
  const workloadSize = readNumber(signal.payload, 'workloadSize')
  const backlogSize = readNumber(signal.payload, 'backlogSize')

  switch (signal.signalType) {
    case 'NEW_DEMAND':
      return {
        title: 'Nova demanda operacional registrada',
        description: practiceArea
          ? `Uma nova demanda foi registrada para a frente ${practiceArea}.`
          : 'Uma nova demanda foi registrada para acompanhamento operacional.',
      }
    case 'CASE_ASSIGNED':
      return {
        title: 'Caso atribuído',
        description: assignmentMode
          ? `O caso foi atribuído com modo operacional ${assignmentMode}.`
          : 'O caso foi atribuído a um responsável operacional.',
      }
    case 'CASE_REASSIGNED':
      return {
        title: 'Caso reatribuído',
        description: reassignmentReason
          ? `O caso foi reatribuído por ${reassignmentReason}.`
          : 'O caso foi reatribuído para rebalanceamento operacional.',
      }
    case 'CASE_CLOSED':
      return {
        title: 'Caso encerrado',
        description: closureReason
          ? `O caso foi encerrado com motivo ${closureReason}.`
          : 'O caso foi encerrado no fluxo operacional.',
      }
    case 'FIRST_RESPONSE':
      return {
        title: 'Primeira resposta profissional registrada',
        description: responseTimeMinutes !== undefined
          ? `A primeira resposta profissional ocorreu em ${responseTimeMinutes} minuto(s) pelo canal ${channel ?? 'operacional'}.`
          : 'A primeira resposta profissional foi registrada no fluxo operacional.',
      }
    case 'WORKLOAD_CHANGED':
      return {
        title: 'Carga operacional alterada',
        description: workloadSize !== undefined
          ? `A carga operacional foi atualizada para ${workloadSize} caso(s) ativos.`
          : 'A carga operacional do responsável foi atualizada.',
      }
    case 'BACKLOG_CHANGED':
      return {
        title: 'Backlog operacional alterado',
        description: backlogSize !== undefined
          ? `O backlog operacional foi atualizado para ${backlogSize} caso(s) ativos.`
          : 'O backlog operacional do escritório foi atualizado.',
      }
    case 'SLA_WARNING':
      return {
        title: 'Alerta de SLA',
        description: 'O caso entrou em faixa de atenção operacional de SLA.',
      }
    case 'SLA_BREACH':
      return {
        title: 'Ruptura de SLA',
        description: 'O caso ultrapassou o limite operacional esperado de SLA.',
      }
    default:
      return {
        title: 'Evento operacional registrado',
        description: `O sinal operacional ${signal.signalType} foi registrado.`,
      }
  }
}

export function interpretOperationalSignal(signal: LegalOperationalSignal): OperationalTimelineEntry {
  const interpreted = buildTitleAndDescription(signal)

  return {
    id: buildEntryId(signal),
    occurredAt: signal.occurredAt,
    eventType: signal.source,
    signalType: signal.signalType,
    title: interpreted.title,
    description: interpreted.description,
    severity: signal.severity,
    metadata: {
      tenantId: signal.tenantId,
      entityId: signal.entityId,
      caseId: signal.caseId ?? null,
      source: signal.source,
      payload: signal.payload,
    },
  }
}

export class OperationalTimelineInterpreter {
  interpret(signal: LegalOperationalSignal) {
    return interpretOperationalSignal(signal)
  }
}

export function createOperationalTimelineInterpreter() {
  return new OperationalTimelineInterpreter()
}
