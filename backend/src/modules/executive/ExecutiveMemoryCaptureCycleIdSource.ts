import { randomUUID } from 'node:crypto'

import type { ExecutiveMemoryCaptureCycleIdSource } from './ExecutiveMemoryCaptureExecutionService.js'

export const EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX = 'executive_memory_capture_cycle'

export interface ExecutiveMemoryCaptureCycleIdSourceDependencies {
  generateUuid?: () => string
}

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory capture cycle id source requires ${label}.`)
  }
}

function assertUuidLike(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Executive memory capture cycle id source requires a valid UUID.')
  }
}

export class CryptoExecutiveMemoryCaptureCycleIdSource
implements ExecutiveMemoryCaptureCycleIdSource {
  private readonly generateUuid: () => string

  constructor(
    dependencies: ExecutiveMemoryCaptureCycleIdSourceDependencies = {},
  ) {
    this.generateUuid = dependencies.generateUuid ?? randomUUID
  }

  nextCaptureCycleId(): string {
    const uuid = this.generateUuid()
    assertNonEmptyString(uuid, 'uuid')
    assertUuidLike(uuid)

    return `${EXECUTIVE_MEMORY_CAPTURE_CYCLE_ID_PREFIX}:${uuid}`
  }
}

export function createExecutiveMemoryCaptureCycleIdSource(
  dependencies: ExecutiveMemoryCaptureCycleIdSourceDependencies = {},
) {
  return new CryptoExecutiveMemoryCaptureCycleIdSource(dependencies)
}
