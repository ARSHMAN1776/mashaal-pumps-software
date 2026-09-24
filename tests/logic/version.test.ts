import { describe, expect, it } from 'vitest'
import { checkVersion, sameVersion } from '../../src/context/actions/core'

describe('record versions', () => {
  it('the same moment written differently is the same version', () => {
    expect(sameVersion('2026-09-25T10:11:12.123456+00:00', '2026-09-25T10:11:12.123456+00:00')).toBe(true)
    expect(sameVersion('2026-09-25T10:11:12.123456+00:00', '2026-09-25T10:11:12.123456Z')).toBe(true)
    expect(sameVersion('2026-09-25T10:11:12.1234+00:00', '2026-09-25 10:11:12.123400+00')).toBe(true)
    expect(sameVersion('2026-09-25T10:11:12+00:00', '2026-09-25T10:11:12.000000Z')).toBe(true)
  })

  it('a later save is a different version, even by one microsecond', () => {
    expect(sameVersion('2026-09-25T10:11:12.123456+00:00', '2026-09-25T10:11:12.123457+00:00')).toBe(false)
    expect(sameVersion('2026-09-25T10:11:12+00:00', '2026-09-25T10:11:13+00:00')).toBe(false)
  })

  it('no version to compare means no check', () => {
    expect(checkVersion({ updatedAt: '2026-09-25T10:11:12+00:00' }, undefined)).toBeNull()
    expect(checkVersion({}, '2026-09-25T10:11:12+00:00')).toBeNull()
    expect(checkVersion(undefined, '2026-09-25T10:11:12+00:00')).toBeNull()
    expect(checkVersion({ updatedAt: '2026-09-25T10:11:12+00:00' }, '2026-09-25T10:11:13+00:00')?.ok).toBe(false)
  })
})
