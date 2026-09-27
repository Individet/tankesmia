import matter from 'gray-matter'
import { WEBSITE } from './constants.ts'
import { sortTexts } from './texts.ts'
import type {
  LinkRef,
  StoredWriter,
  WriterRegistryEntry,
  WrittenText,
} from './types.ts'

const LINK_LABELS: Record<string, string> = {
  hjemmeside: 'Hjemmeside',
  substack: 'Substack',
  blogg: 'Blogg',
  podcast: 'Podkast',
  youtube: 'YouTube',
  x: 'X (Twitter)',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  wikipedia: 'Wikipedia',
  snl: 'Store norske leksikon',
  forfatterside: 'Forfatterside',
  akademisk: 'Akademisk profil',
  forlag: 'Forlag',
  intervju: 'Intervju',
  annet: 'Lenke',
}

const OWN_PLATFORM_TYPES = new Set([
  'hjemmeside', 'substack', 'blogg', 'podcast', 'youtube', 'x', 'facebook', 'instagram', 'linkedin',
])

function linkLabel(link: LinkRef): string {
  const base = LINK_LABELS[link.type] ?? link.type
  return link.label && link.label !== base ? `${base}: ${link.label}` : base
}

function dedupeLinks(links: LinkRef[]): LinkRef[] {
  const seen = new Set<string>()
  return links.filter((l) => {
    const key = l.url.replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '').toLowerCase()
    return seen.has(key) ? false : (seen.add(key), true)
  })
}

/**
 * Kanaler og lenker fra research, supplert med de manuelt kuraterte lenkene
 * i registeret (som alltid vinner — de er verifisert av et menneske).
 */
export function collectLinks(entry: WriterRegistryEntry, stored: StoredWriter) {
  const registry = entry.links ?? []
  const all = dedupeLinks([
    ...registry,
    ...(stored.profile?.platforms ?? []),
    ...(stored.profile?.links ?? []),
  ])
  return {
    platforms: all.filter((l) => OWN_PLATFORM_TYPES.has(l.type)),
    other: all.filter((l) => !OWN_PLATFORM_TYPES.has(l.type)),
  }
}

export function imagePublicUrl(stored: StoredWriter): string | undefined {
  if (stored.image) return `${WEBSITE.imageUrlPrefix}/${stored.image.fileName}`
  return stored.profile?.image?.url
}

function formatText(text: WrittenText): string {
  const title = text.url ? `[${escapeMd(text.title)}](${text.url})` : `*${escapeMd(text.title)}*`
  const meta = [text.publication, text.kind && text.kind !== 'artikkel' ? text.kind : null]
    .filter(Boolean)
    .join(', ')
  const date = text.date && text.date.length > 4 ? `${text.date} — ` : ''
  return `- ${date}${title}${meta ? ` (${meta})` : ''}`
}

function escapeMd(value: string): string {
  return value.replace(/([\[\]])/g, '\\$1')
}

export function renderTextList(texts: WrittenText[]): string {
  if (texts.length === 0) return '_Ingen registrerte tekster ennå._'
  const lines: string[] = []
  let currentYear: string | null = null
  for (const text of sortTexts(texts)) {
    const year = text.date?.slice(0, 4) ?? 'Udatert'
    if (year !== currentYear) {
      if (currentYear !== null) lines.push('')
      lines.push(`### ${year}`, '')
      currentYear = year
    }
    lines.push(formatText(text))
  }
  return lines.join('\n')
}

/**
 * Setter sammen hele profilsiden. Bare `body` kommer fra LLM — alt annet
 * (header, lenker, tekstliste) rendres deterministisk fra lagrede data, slik
 * at tekstlista kan oppdateres uten å kalle en modell.
 */
export function renderWriterPage(entry: WriterRegistryEntry, stored: StoredWriter): string {
  const profile = stored.profile
  const name = profile?.name || entry.name
  const tagline = profile?.tagline || entry.description
  const image = imagePublicUrl(stored)
  const { platforms, other } = collectLinks(entry, stored)
  const texts = stored.state.knownTexts
  const born = profile?.born ?? entry.born
  const died = profile?.died ?? entry.died
  const lifespan = born ? ` (${born}–${died ?? ''})` : ''

  const frontmatter: Record<string, unknown> = {
    title: name,
    slug: entry.id,
    type: 'skribent',
    description: tagline,
    ...(image ? { image } : {}),
    ...(profile?.image?.credit ? { image_credit: profile.image.credit } : {}),
    ...(profile?.image?.license ? { image_license: profile.image.license } : {}),
    themes: profile?.themes ?? [],
    platforms: platforms.map(({ type, url }) => ({ type, url })),
    text_count: texts.length,
    updated: (stored.state.lastWrittenAt ?? stored.state.lastResearchedAt ?? '').slice(0, 10),
    list_updated: latestTextDate(texts) ?? '',
  }

  const sections: string[] = []
  if (image) {
    sections.push(`![${name}](${image})`)
    const credit = [profile?.image?.credit, profile?.image?.license].filter(Boolean).join(', ')
    if (credit) {
      const source = profile?.image?.sourcePage ? ` ([kilde](${profile.image.sourcePage}))` : ''
      sections.push(`<small>Foto: ${credit}${source}</small>`)
    }
  }
  sections.push(`**${name}**${lifespan} — ${tagline}`)

  if (platforms.length > 0) {
    sections.push('## Egne kanaler', platforms.map((l) => `- [${linkLabel(l)}](${l.url})`).join('\n'))
  }
  if (other.length > 0) {
    sections.push('## Andre lenker', other.map((l) => `- [${linkLabel(l)}](${l.url})`).join('\n'))
  }

  sections.push((stored.body ?? '').trim())
  sections.push(`## Tekster av ${name}`, renderTextList(texts))

  return matter.stringify(`\n${sections.join('\n\n')}\n`, frontmatter)
}

function latestTextDate(texts: WrittenText[]): string | undefined {
  return texts.map((t) => t.date).filter(Boolean).sort().pop()
}

/** Oversiktssiden (`_index.md`) — generert uten LLM hver kjøring. */
export function renderIndexPage(
  writers: Array<{ entry: WriterRegistryEntry; stored: StoredWriter }>,
): string {
  const sorted = [...writers].sort((a, b) =>
    lastName(a.entry.name).localeCompare(lastName(b.entry.name), 'nb'),
  )

  const cards = sorted.map(({ entry, stored }) => {
    const image = imagePublicUrl(stored)
    const tagline = stored.profile?.tagline || entry.description
    const themes = stored.profile?.themes?.slice(0, 4).join(', ')
    return [
      `### [${stored.profile?.name || entry.name}](${WEBSITE.pageUrlPrefix}/${entry.id}/)`,
      '',
      image ? `![${entry.name}](${image})` : null,
      image ? '' : null,
      tagline,
      '',
      `<small>${stored.state.knownTexts.length} tekster${themes ? ` · ${themes}` : ''}</small>`,
    ]
      .filter((line) => line !== null)
      .join('\n')
  })

  return matter.stringify(
    [
      '',
      'Individet samler her profiler av norske skribenter, tenkere og debattanter som på hver sin måte forsvarer individets frihet og selvråderett — med en oversikt over hva de har skrevet.',
      '',
      'Profilene oppdateres automatisk når noe nytt skjer.',
      '',
      ...cards.flatMap((card) => [card, '']),
    ].join('\n'),
    {
      title: 'Frihetens skribenter',
      description: 'Profiler av norske skribenter som forsvarer individets frihet.',
      type: 'skribenter',
      writer_count: sorted.length,
    },
  )
}

function lastName(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name
}
