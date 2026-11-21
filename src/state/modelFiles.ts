import { useModelLoad } from './modelLoad'

/**
 * The model files, downloaded by hand so that a file is asked for ONCE however many parts of the game want it: the early request that
 * warms things up (see game.ts) and the 3D view's loader share the same download, and the loader parses what the warm-up fetched
 * instead of asking the server again (a second request, even a short "not modified", is one more round trip on a phone).
 */
const files = new Map<string, Promise<ArrayBuffer>>()
/** every file asked for so far (and not failed): an early request for one of them is pointless */
const asked = new Set<string>()

async function download(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body) return res.arrayBuffer()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    useModelLoad.getState().progress(url, loaded, total)
  }
  const all = new Uint8Array(loaded)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.length
  }
  return all.buffer
}

/** The bytes of the file: the download in progress (or done) if there is one, else a new one. A failed download is forgotten, so that asking again tries again. */
export function fetchModel(url: string): Promise<ArrayBuffer> {
  let file = files.get(url)
  if (!file) {
    file = download(url)
    files.set(url, file)
    asked.add(url)
    file.catch(() => {
      files.delete(url)
      asked.delete(url)
    })
  }
  return file
}

/** The bytes for the one who parses them: the file is let go of afterwards (the parsed model is kept by the loader). */
export function takeModel(url: string): Promise<ArrayBuffer> {
  const file = fetchModel(url)
  void file.then(() => files.delete(url), () => undefined)
  return file
}

/** An early request, so that the file is on its way before the 3D view wants it; nothing happens if the file was asked for already. */
export function warmModel(url: string): void {
  if (!asked.has(url)) fetchModel(url).catch(() => undefined)
}
