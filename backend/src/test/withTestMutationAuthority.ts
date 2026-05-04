import { runWithMutationAuthority } from '../sovereignty/authorityBoundary.js'

export async function withTestMutationAuthority<T>(source: string, fn: () => Promise<T>): Promise<T> {
  return runWithMutationAuthority({
    source,
    viaExecutor: true,
  }, fn)
}