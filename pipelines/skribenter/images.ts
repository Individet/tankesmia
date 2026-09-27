import type { FetchLike, WriterImage } from './types.ts'

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Laster ned profilbildet så nettsiden ikke hotlinker. Feiler stille —
 * da brukes bilde-URL-en direkte.
 */
export async function downloadImage(
  writerId: string,
  image: WriterImage,
  fetchFn: FetchLike,
): Promise<{ fileName: string; data: Buffer } | null> {
  try {
    const response = await fetchFn(image.url, {
      headers: { 'user-agent': 'individet-skribenter/1.0 (+https://individet.no)' },
    })
    if (!response.ok) return null
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const ext = EXTENSIONS[type]
    if (!ext) return null
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length === 0 || data.length > MAX_BYTES) return null
    return { fileName: `${writerId}.${ext}`, data }
  } catch {
    return null
  }
}
