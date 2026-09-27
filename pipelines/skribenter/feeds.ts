import { THRESHOLDS } from './constants.ts'
import type { FetchLike, WrittenText } from './types.ts'

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function tag(block: string, name: string): string | undefined {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return match ? decodeEntities(match[1]) : undefined
}

function toIsoDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return undefined
  return new Date(parsed).toISOString().slice(0, 10)
}

/** Minimal RSS 2.0 / Atom-parser — nok til å hente tittel, lenke og dato. */
export function parseFeed(xml: string, feedUrl = ''): WrittenText[] {
  const channelTitle = tag(xml.split(/<item[\s>]|<entry[\s>]/i)[0] ?? '', 'title')
  const publication = channelTitle || safeHost(feedUrl)
  const items: WrittenText[] = []

  for (const match of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const block = match[1]
    const title = tag(block, 'title')
    const link = tag(block, 'link') ?? tag(block, 'guid')
    if (!title) continue
    items.push({
      title,
      url: link,
      date: toIsoDate(tag(block, 'pubDate') ?? tag(block, 'dc:date')),
      publication,
      kind: 'artikkel',
      foundBy: 'feed',
    })
  }

  for (const match of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)) {
    const block = match[1]
    const title = tag(block, 'title')
    const href =
      block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
      block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]
    if (!title) continue
    items.push({
      title,
      url: href ? decodeEntities(href) : undefined,
      date: toIsoDate(tag(block, 'published') ?? tag(block, 'updated')),
      publication,
      kind: 'artikkel',
      foundBy: 'feed',
    })
  }

  return items
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

/**
 * Henter alle feeder for én skribent. Feil er ikke fatale — en feed som er
 * nede skal ikke stoppe kjøringen, bare logges.
 */
export async function fetchWriterFeeds(
  feeds: string[],
  fetchFn: FetchLike,
): Promise<{ items: WrittenText[]; errors: string[] }> {
  const items: WrittenText[] = []
  const errors: string[] = []

  await Promise.all(
    feeds.map(async (feedUrl) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), THRESHOLDS.feedTimeoutMs)
      try {
        const response = await fetchFn(feedUrl, {
          signal: controller.signal,
          headers: { 'user-agent': 'individet-skribenter/1.0 (+https://individet.no)' },
        })
        if (!response.ok) {
          errors.push(`${feedUrl}: HTTP ${response.status}`)
          return
        }
        items.push(...parseFeed(await response.text(), feedUrl))
      } catch (error) {
        errors.push(`${feedUrl}: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        clearTimeout(timer)
      }
    }),
  )

  return { items, errors }
}
