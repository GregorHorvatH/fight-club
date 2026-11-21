import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchModel, takeModel, warmModel } from '../src/state/modelFiles'

const reply = (n: number) => new Response(new Uint8Array(n))

afterEach(() => vi.unstubAllGlobals())

describe('model files', () => {
  it('asks the server once, however many ask', async () => {
    const get = vi.fn(async () => reply(8))
    vi.stubGlobal('fetch', get)
    warmModel('a.glb')
    const [x, y] = await Promise.all([takeModel('a.glb'), fetchModel('a.glb')])
    expect(get).toHaveBeenCalledTimes(1)
    expect(x.byteLength).toBe(8)
    expect(y.byteLength).toBe(8)
  })

  it('does not warm up a file that was loaded already', async () => {
    const get = vi.fn(async () => reply(4))
    vi.stubGlobal('fetch', get)
    await takeModel('b.glb')
    warmModel('b.glb')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('tries again after a failure', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(reply(2))
    vi.stubGlobal('fetch', get)
    await expect(takeModel('c.glb')).rejects.toThrow('offline')
    expect((await takeModel('c.glb')).byteLength).toBe(2)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
