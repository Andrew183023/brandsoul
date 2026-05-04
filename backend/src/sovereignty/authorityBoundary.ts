import { AsyncLocalStorage } from 'node:async_hooks'

export type ProtectedMutationType =
  | 'entity'
  | 'memory'
  | 'registry'
  | 'approval'
  | 'proposal'
  | 'portfolio'

export type MutationAuthorityContext = {
  source: string
  viaExecutor: boolean
}

export type MutationLogRecord = {
  source: string
  type: ProtectedMutationType
  viaExecutor: boolean
  targetId?: string
  whatChanged?: string
  callerChain: string[]
}

const authorityContextStore = new AsyncLocalStorage<MutationAuthorityContext>()

function parseCallerChain() {
  const stack = new Error().stack?.split('\n').slice(3) ?? []
  return stack
    .map((line) => line.trim().replace(/^at\s+/, ''))
    .filter((line) => line.length > 0)
    .slice(0, 8)
}

export function getMutationAuthorityContext() {
  return authorityContextStore.getStore()
}

export async function runWithMutationAuthority<T>(
  context: MutationAuthorityContext,
  work: () => Promise<T>,
): Promise<T> {
  return authorityContextStore.run(context, work)
}

export function logMutation(record: MutationLogRecord) {
  console.info('log.mutation', record)
}

function isAuthorityBoundaryEnforced() {
  return true
}

export function traceMutation(args: {
  source: string
  type: ProtectedMutationType
  targetId?: string
  whatChanged: string
}) {
  const context = getMutationAuthorityContext()
  const viaExecutor = context?.viaExecutor === true
  const record: MutationLogRecord = {
    source: args.source,
    type: args.type,
    viaExecutor,
    targetId: args.targetId,
    whatChanged: args.whatChanged,
    callerChain: parseCallerChain(),
  }

  logMutation(record)

  if (!viaExecutor && isAuthorityBoundaryEnforced()) {
    const error = new Error(
      `FLOWMIND_AUTHORITY_BOUNDARY_VIOLATION: ${args.source} attempted ${args.type} mutation outside executor.`,
    ) as Error & { code?: string }
    error.code = 'FLOWMIND_AUTHORITY_BOUNDARY_VIOLATION'
    throw error
  }
}
