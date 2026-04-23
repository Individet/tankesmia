import Anthropic from '@anthropic-ai/sdk'

export interface ImageMeta {
  id: string
  url: string
  license: string
  attribution: string
  alt: string
}

export interface ArticleImages {
  hero: ImageMeta
  inline: ImageMeta[]
}

interface WikiSearchResult {
  title: string
  pageid: number
}

interface WikiImageInfo {
  url: string
  extmetadata?: {
    LicenseShortName?: { value: string }
    Artist?: { value: string }
    ImageDescription?: { value: string }
  }
}

const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php'
const MAX_INLINE_IMAGES = 3
export const PLACEHOLDER_IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/No_image_available.svg/480px-No_image_available.svg.png'

export function createFallbackImages(title: string): ArticleImages {
  return {
    hero: {
      id: 'hero',
      url: PLACEHOLDER_IMAGE_URL,
      license: 'Public Domain',
      attribution: 'Wikimedia Commons',
      alt: title,
    },
    inline: [],
  }
}

const WIKIMEDIA_HEADERS = {
  'User-Agent': 'Individet-Tankesmia/1.0 (https://individet.no)',
  Accept: 'application/json',
}

async function wikimediaFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: WIKIMEDIA_HEADERS })
  if (!res.ok) {
    throw new Error(`Wikimedia API feilet: ${res.status} ${res.statusText}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Wikimedia API returnerte ikke JSON (content-type: ${contentType})`,
    )
  }
  return res.json()
}

async function searchWikimedia(query: string): Promise<WikiSearchResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '6',
    srlimit: '10',
    format: 'json',
    origin: '*',
  })

  const data = (await wikimediaFetchJson(`${WIKIMEDIA_API}?${params}`)) as {
    query?: { search?: WikiSearchResult[] }
  }
  return data.query?.search ?? []
}

async function fetchImageInfo(filename: string): Promise<WikiImageInfo | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: `File:${filename}`,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    format: 'json',
    origin: '*',
  })

  const data = (await wikimediaFetchJson(`${WIKIMEDIA_API}?${params}`)) as {
    query?: {
      pages?: Record<string, { imageinfo?: WikiImageInfo[] }>
    }
  }

  const pages = data.query?.pages
  if (!pages) return null

  const page = Object.values(pages)[0]
  return page?.imageinfo?.[0] ?? null
}

function isAcceptableLicense(license: string | undefined): boolean {
  if (!license) return false
  return (
    license.includes('CC') ||
    license.includes('Public Domain') ||
    license.toLowerCase().includes('pd')
  )
}

function stripHtml(value: string): string {
  // Replace all tags iteratively until no more tags remain
  let result = value
  let prev = ''
  while (result !== prev) {
    prev = result
    result = result.replace(/<[^>]*>/g, '')
  }
  return result
}

function buildAttribution(info: WikiImageInfo, filename: string): string {
  const artist =
    info.extmetadata?.Artist?.value != null
      ? stripHtml(info.extmetadata.Artist.value)
      : filename
  return `${artist}, via Wikimedia Commons`
}

function buildAlt(info: WikiImageInfo, filename: string): string {
  const desc =
    info.extmetadata?.ImageDescription?.value != null
      ? stripHtml(info.extmetadata.ImageDescription.value).trim()
      : filename.replace(/_/g, ' ')
  return desc.slice(0, 200)
}

async function scoreRelevance(
  client: Anthropic,
  searchQuery: string,
  description: string,
): Promise<boolean> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [
      {
        role: 'user',
        content: `Er følgende bildbeskrivelse relevant for søket "${searchQuery}"?\nBeskrivelse: "${description}"\nSvar kun med "ja" eller "nei".`,
      },
    ],
  })
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.Messages.TextBlock).text)
    .join('')
    .toLowerCase()
  return text.includes('ja')
}

export interface ImageSearchEntry {
  filename: string
  query: string
  accepted: boolean
  reason: string
  url?: string
  license?: string
}

async function findImages(
  client: Anthropic,
  query: string,
  idPrefix: string,
  maxImages: number,
  searchLog: ImageSearchEntry[],
): Promise<ImageMeta[]> {
  const searchResults = await searchWikimedia(query)
  const images: ImageMeta[] = []

  for (const result of searchResults) {
    if (images.length >= maxImages) break

    const filename = result.title.replace(/^File:/, '')
    const info = await fetchImageInfo(filename)
    if (!info) {
      searchLog.push({
        filename,
        query,
        accepted: false,
        reason: 'no-image-info',
      })
      continue
    }

    const license = info.extmetadata?.LicenseShortName?.value
    if (!isAcceptableLicense(license)) {
      searchLog.push({
        filename,
        query,
        accepted: false,
        reason: `bad-license: ${license ?? 'none'}`,
        url: info.url,
        license: license ?? undefined,
      })
      continue
    }

    const description =
      info.extmetadata?.ImageDescription?.value != null
        ? stripHtml(info.extmetadata.ImageDescription.value)
        : filename

    const relevant = await scoreRelevance(client, query, description)
    if (!relevant) {
      searchLog.push({
        filename,
        query,
        accepted: false,
        reason: 'not-relevant',
        url: info.url,
        license,
      })
      continue
    }

    const id =
      images.length === 0 && idPrefix === 'hero'
        ? 'hero'
        : `${idPrefix}-${images.length + 1}`

    images.push({
      id,
      url: info.url,
      license: license ?? 'Unknown',
      attribution: buildAttribution(info, filename),
      alt: buildAlt(info, filename),
    })
    searchLog.push({
      filename,
      query,
      accepted: true,
      reason: 'ok',
      url: info.url,
      license,
    })
  }

  return images
}

export interface ImageSearchResult {
  images: ArticleImages
  searchLog: ImageSearchEntry[]
}

export async function findArticleImages(topic: {
  slug: string
  title: string
}): Promise<ImageSearchResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY mangler')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const searchLog: ImageSearchEntry[] = []

  console.log(`[03-images] Søker etter bilder for "${topic.title}"...`)

  const heroResults = await findImages(
    client,
    topic.title,
    'hero',
    1,
    searchLog,
  )

  let hero: ImageMeta
  if (heroResults.length > 0) {
    hero = heroResults[0]
    console.log(`[03-images] Hero-bilde funnet: ${hero.url}`)
  } else {
    console.warn(
      `[03-images] Ingen hero-bilde funnet for "${topic.title}", bruker placeholder`,
    )
    hero = createFallbackImages(topic.title).hero
  }

  const inlineImages = await findImages(
    client,
    topic.slug.replace(/-/g, ' '),
    topic.slug,
    MAX_INLINE_IMAGES,
    searchLog,
  )
  console.log(`[03-images] Fant ${inlineImages.length} inline-bilder`)
  console.log(
    `[03-images] Bildesøk-logg: ${searchLog.filter((e) => e.accepted).length} akseptert, ${searchLog.filter((e) => !e.accepted).length} avvist`,
  )

  return { images: { hero, inline: inlineImages }, searchLog }
}
