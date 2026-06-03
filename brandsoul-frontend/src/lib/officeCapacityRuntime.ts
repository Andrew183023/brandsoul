import type { AdminLegalCase, OfficeBusinessConfig } from '../backend-bridge/api/adminApi'

export type CapacityState = 'NORMAL' | 'ATENCAO' | 'PRESSAO' | 'OVERLOAD'

export type OfficeCapacityRuntime = {
  state: CapacityState
  reason: string
  declaredCapacity: number
  activeCases: number
  activeOperators: number
  configuredSlaMinutes: number | null
  freeCapacity: number
  utilizationPercent: number
  operationalPressurePercent: number
  overloadRisk: 'baixo' | 'moderado' | 'alto'
}

function normalizeText(value?: string) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
}

function parseSlaMinutes(config?: OfficeBusinessConfig | null) {
  const avgResponse = config?.avgResponseMinutes
  if (typeof avgResponse === 'number' && Number.isFinite(avgResponse) && avgResponse > 0) {
    return Math.round(avgResponse)
  }

  const label = normalizeText(config?.serviceRules?.responseWindowLabel)
  if (!label) {
    return null
  }

  const hourMatch = label.match(/(\d+)\s*h/)
  if (hourMatch) {
    const hours = Number.parseInt(hourMatch[1] ?? '0', 10)
    if (hours > 0) {
      return hours * 60
    }
  }

  const minuteMatch = label.match(/(\d+)\s*min/)
  if (minuteMatch) {
    const minutes = Number.parseInt(minuteMatch[1] ?? '0', 10)
    if (minutes > 0) {
      return minutes
    }
  }

  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resolveActiveCases(cases: AdminLegalCase[]) {
  return cases.filter((item) => item.status !== 'closed')
}

function resolveDeclaredCapacity(args: {
  config?: OfficeBusinessConfig | null
  activeOperators: number
}) {
  const configured = args.config?.maxCapacity
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return Math.round(configured)
  }

  if (args.activeOperators > 0) {
    return args.activeOperators * 6
  }

  return 12
}

function resolveState(args: {
  utilization: number
  pressure: number
  activeCases: number
  declaredCapacity: number
}) {
  if (args.activeCases === 0) {
    return 'NORMAL' as const
  }

  if (args.utilization >= 1 || args.pressure >= 85) {
    return 'OVERLOAD' as const
  }

  if (args.utilization >= 0.85 || args.pressure >= 70) {
    return 'PRESSAO' as const
  }

  if (args.utilization >= 0.65 || args.pressure >= 45) {
    return 'ATENCAO' as const
  }

  return 'NORMAL' as const
}

export function evaluateOfficeCapacityRuntime(args: {
  cases: AdminLegalCase[]
  officeConfig?: OfficeBusinessConfig | null
}): OfficeCapacityRuntime {
  const activeCases = resolveActiveCases(args.cases)
  const activeOperators = new Set(
    activeCases
      .map((item) => item.assignedProfessionalId?.trim() ?? item.assignedLawyerId?.trim() ?? '')
      .filter((value) => value.length > 0),
  ).size

  const declaredCapacity = resolveDeclaredCapacity({
    config: args.officeConfig,
    activeOperators,
  })

  const currentLoad = activeCases.length
  const configuredSlaMinutes = parseSlaMinutes(args.officeConfig)
  const freeCapacity = declaredCapacity - currentLoad
  const utilization = declaredCapacity > 0 ? currentLoad / declaredCapacity : 1

  const perOperatorLoad = activeOperators > 0 ? currentLoad / activeOperators : currentLoad
  const saturationWeight = clamp((utilization * 70), 0, 70)
  const operatorWeight = clamp((perOperatorLoad / 6) * 18, 0, 18)
  const slaWeight = configuredSlaMinutes == null
    ? 8
    : configuredSlaMinutes <= 120
      ? 12
      : configuredSlaMinutes <= 240
        ? 8
        : 4
  const queueUnassignedWeight = clamp((activeCases.filter((item) => !item.isAssigned).length / Math.max(currentLoad, 1)) * 12, 0, 12)

  const operationalPressurePercent = clamp(Math.round(saturationWeight + operatorWeight + slaWeight + queueUnassignedWeight), 0, 100)
  const utilizationPercent = clamp(Math.round(utilization * 100), 0, 999)

  const state = resolveState({
    utilization,
    pressure: operationalPressurePercent,
    activeCases: currentLoad,
    declaredCapacity,
  })

  const overloadRisk = state === 'OVERLOAD'
    ? 'alto'
    : state === 'PRESSAO'
      ? 'alto'
      : state === 'ATENCAO'
        ? 'moderado'
        : 'baixo'

  const reason = `Capacidade declarada: ${declaredCapacity}. Casos ativos: ${currentLoad}. Operadores ativos: ${activeOperators}. Risco: ${state}.`

  return {
    state,
    reason,
    declaredCapacity,
    activeCases: currentLoad,
    activeOperators,
    configuredSlaMinutes,
    freeCapacity,
    utilizationPercent,
    operationalPressurePercent,
    overloadRisk,
  }
}
