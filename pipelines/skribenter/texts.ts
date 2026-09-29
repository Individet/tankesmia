import { createHash } from 'crypto'
import type { WriterRegistryEntry, WrittenText } from './types.ts'

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|ref$|source$|r$|s$)/i

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim())
    url.hash = ''
    url.protocol = 'https:'
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key)
    }
    const out = url.toString()
    return out.endsWith('/') ? out.slice(0, -1) : out
  } catch {
    return raw.trim().toLowerCase()
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[«»"'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Bare vanlige nettadresser slipper gjennom til siden. Stopper
 * `javascript:`-lenker, relative stier og annet rusk fra modellsvar.
 */
export function isHttpUrl(value: string | undefined | null): value is string {
  if (!value) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** Fjerner ugyldige URL-er fra tekster fra modell eller feed (teksten beholdes). */
export function sanitizeTexts(texts: WrittenText[]): WrittenText[] {
  return texts
    .filter((t) => typeof t?.title === 'string' && t.title.trim())
    .map((t) => {
      const { url, ...rest } = t
      return isHttpUrl(url) ? { ...rest, url: url.trim(), title: t.title.trim() } : { ...rest, title: t.title.trim() }
    })
}

/** Nøkkel for deduplisering: URL når den finnes, ellers tittel + år. */
export function textKey(text: WrittenText): string {
  if (text.url) return `url:${normalizeUrl(text.url)}`
  return `title:${normalizeTitle(text.title)}:${text.date?.slice(0, 4) ?? ''}`
}

/**
 * Slår sammen kjente og nye tekster. Eksisterende oppføringer beholdes (og
 * beholder firstSeenAt), men manglende felt fylles ut fra nyere funn.
 * Returnerer også hvilke tekster som faktisk var nye.
 */
export function mergeTexts(
  known: WrittenText[],
  incoming: WrittenText[],
  seenAt: string,
): { merged: WrittenText[]; added: WrittenText[] } {
  const byKey = new Map<string, WrittenText>()
  const titleIndex = new Map<string, string>()
  for (const text of known) {
    const key = textKey(text)
    byKey.set(key, text)
    titleIndex.set(normalizeTitle(text.title), key)
  }

  const added: WrittenText[] = []
  for (const text of incoming) {
    if (!text.title?.trim()) continue
    let key = textKey(text)
    // Samme tekst funnet én gang med URL og én gang uten: match på tittel.
    if (!byKey.has(key) && !text.url) {
      key = titleIndex.get(normalizeTitle(text.title)) ?? key
    }
    const existing = byKey.get(key)
    if (existing) {
      byKey.set(key, {
        ...existing,
        url: existing.url ?? text.url,
        date: existing.date ?? text.date,
        publication: existing.publication ?? text.publication,
        kind: existing.kind ?? text.kind,
      })
      continue
    }
    const fresh = { ...text, firstSeenAt: text.firstSeenAt ?? seenAt }
    byKey.set(key, fresh)
    titleIndex.set(normalizeTitle(text.title), key)
    added.push(fresh)
  }

  return { merged: sortTexts(Array.from(byKey.values())), added }
}

/** Kronologisk (eldst først). Udaterte tekster havner sist. */
export function sortTexts(texts: WrittenText[]): WrittenText[] {
  return [...texts].sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title, 'nb')
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'nb')
  })
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Hash av registeroppføringen — endres den, profileres skribenten på nytt.
 * `enabled` og `suggested` påvirker ikke profilen og er holdt utenfor, så å
 * godkjenne et forslag eller skru en skribent av og på koster ingenting.
 */
export function registryHash(entry: WriterRegistryEntry): string {
  const { enabled: _enabled, suggested: _suggested, ...rest } = entry
  return createHash('sha256').update(stableStringify(rest)).digest('hex').slice(0, 16)
}

export function daysBetween(fromIso: string | undefined, now: Date): number {
  if (!fromIso) return Number.POSITIVE_INFINITY
  const from = Date.parse(fromIso)
  if (Number.isNaN(from)) return Number.POSITIVE_INFINITY
  return (now.getTime() - from) / 86_400_000
}
