import { bindActions, type ActionCtx } from '../../src/context/actions'
import { deriveStation } from '../../src/data/derive'
import { createMemoryBackend } from '../../src/data/memoryBackend'
import { applyResults, type RawStation } from '../../src/data/raw'
import { buildFixtures, PREVIEW_PASSWORD } from '../../src/dev/fixtures'
import type { Backend } from '../../src/data/backend'
import type { StationData, User } from '../../src/types'
import { createPgliteBackend } from './pgliteBackend'

export type BackendKind = 'memory' | 'pglite'
export const freshBackend = async (kind: BackendKind): Promise<Backend> =>
  kind === 'memory' ? createMemoryBackend(buildFixtures()) : createPgliteBackend()

/** Signs in as `username` at `siteId` and returns bound actions, exactly like the running app does. */
export async function openStation(siteId: string, username: string, backend: Backend) {
  const be = backend
  const password = (be as { passwords?: Record<string, string> }).passwords?.[username] ?? PREVIEW_PASSWORD
  const user: User = await be.signIn(username, password, false)
  let raw: RawStation = await be.loadStation(siteId, user.role)
  const ctx = (): ActionCtx => ({
    siteId,
    user,
    raw,
    data: deriveStation(raw),
    commit: async (ops) => {
      const res = await be.applyOps(siteId, ops)
      raw = applyResults(raw, res)
      return res
    },
    nextNo: (kind) => be.nextDocNo(siteId, kind),
  })
  const act = bindActions(ctx)
  return {
    be,
    act,
    user,
    get raw() { return raw },
    get data(): StationData { return deriveStation(raw) },
    async reload() { raw = await be.loadStation(siteId, user.role) },
  }
}

export type Station = Awaited<ReturnType<typeof openStation>>

/** unwrap a successful Result or fail the test with the error message */
export function must<T>(r: { ok: true; value: T } | { ok: false; error: string; code?: string }): T {
  if (!r.ok) throw new Error(`expected success but got: ${r.error} [${r.code ?? ''}]`)
  return r.value
}

export const failed = (r: { ok: boolean; error?: string; code?: string }) => {
  if (r.ok) throw new Error('expected a failure but the action succeeded')
  return { error: r.error as string, code: r.code }
}
