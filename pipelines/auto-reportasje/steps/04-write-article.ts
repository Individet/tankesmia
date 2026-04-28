import Anthropic from '@anthropic-ai/sdk'
import { promises as fs } from 'fs'
import matter from 'gray-matter'
import path from 'path'
import type { Topic } from './01-choose-topic.ts'
import type { ResearchResults } from './02-research.ts'
import type { ArticleImages } from './03-images.ts'

export interface ArticleFrontmatter {
  title: string
  date: string
  slug: string
  description: string
  tags: string[]
}

export interface Article {
  frontmatter: ArticleFrontmatter
  pitch: string
  socialHook: string
  ingress: string
  body: string
  sources: string
  publishableMarkdown: string
  raw: string
  apiMeta: {
    model: string
    stopReason: string | null
    usage: { input_tokens: number; output_tokens: number }
  }
}

const MODEL = 'claude-opus-4-6'
const MAX_TOKENS = 8000
const MANIFEST_PATH = path.join('manifest-kondensert.md')

function lagSystemPrompt(manifest: string): string {
  return `Du er en journalist og skribent for tenketanken Individet (individet.no).

## Individets verdigrunnlag

Individet er en norsk tenketank forankret i prinsippet om individuell suverenitet. Les og internalisér manifestet nedenfor — det er ikke bare bakgrunnsinfo, men kjernen i Individets identitet og stemme.

--- START MANIFEST: INDIVIDETS SUVERENITET ---
${manifest}
--- SLUTT MANIFEST ---

## Analytisk rammeverk

Bruk disse tre linsene aktivt i reportasjen:

1. **Evalueringsnøkkelen:** For hvert politisk tiltak, historisk hendelse eller aktør: *Øker dette den enkeltes kontroll over sitt eget liv — eller overfører det kontroll til staten?* Dette spørsmålet skal være reportasjens analytiske kjerne når emnet kobles til Individets perspektiv.

2. **Intensjonsimmunitet:** Gode intensjoner rettferdiggjør ikke tvang. Positive utfall rettferdiggjør ikke tvang. Illustrer gjerne hvordan velmenende aktører eller regimer rettferdiggjorde overgrepene i ditt emne med gode intensjoner.

3. **Den filosofiske slektslinjen:** Manifestet bygger på en klar intellektuell tradisjon — Aristoteles, Stoikerne, Locke, Bastiat, Rand, Hayek, Paterson, Wilder Lane, Spooner. Der det er naturlig, sett emnet inn i denne tradisjonen: Hvem av disse tenkerne belyser det som skjedde? Hva ville Bastiat eller Hayek sagt om dette?

## Språk og stil

- Skriv på norsk bokmål
- Manifestets stemme: kraftig, direkte, med filosofiske referanser der det styrker teksten
- Faktuell og kildekritisk — bygg på research-materialet, ikke på egne påstander
- Variert tempostyring: korte setninger for dramatikk, lengre for kontekst og resonans
- Hold spenningen stigende gjennom reportasjen frem mot konklusjonen

## Kildebruk

Research-materialet inneholder direkte sitater med fotnoter ([^1], [^2], ...) og tilhørende kildeliste. Bruk disse aktivt:
- Sitér relevante passasjer i reportasjen der de styrker argumentasjonen
- Behold fotnote-referansene når du siterer
- Kildelisten i KILDER-seksjonen MÅ inneholde alle brukte fotnoter. Minimumsantall: 5 kilder.

## Bildereferanser

Bruk inline-bilder slik: \`![alt-tekst](bilde-id)\` der \`bilde-id\` er verdien fra ImageMeta.id-feltet.
Hero-bildet inkluderes ikke inline — det plasseres automatisk øverst.

## Outputmal

Du MÅ følge denne malen NØYAKTIG. Start med YAML frontmatter, deretter skriv hver seksjon adskilt med seksjonsoverskriften i STORE BOKSTAVER på en egen linje, etterfulgt av en linje med minst 5 =-tegn.

\`\`\`
---
title: "Tittel på reportasjen"
date: YYYY-MM-DD
slug: emne-slug
author: "${MODEL}"
description: "Kort beskrivelse på 1-2 setninger for søkemotorer og forhåndsvisning"
tags: [tag1, tag2, tag3]
---

PITCH TIL REDAKTØR
==================

(pitch her)

HOOK TIL SOME
=============

(SoMe-hook her)

INGRESS
=======

(ingress her)

REPORTASJE
==========

(reportasje her)

KILDER
======

(kildeliste her)
\`\`\`

### PITCH TIL REDAKTØR

Skriv en pitch til redaktøren. Denne seksjonen er din «tenke-fase» — bruk den til å:
- Oppsummere den viktigste vinkelen på dette emnet
- Forklare hvorfor denne historien passer til tenketanken Individet
- Identifisere den sterkeste hooken i materialet
- Nevne eventuelle svakheter eller hull i research-materialet

### HOOK TIL SOME

Skriv 3–4 setninger som får lesere på Facebook og Twitter/X til å klikke seg inn i reportasjen. Vær skarp, direkte og skapende nysgjerrig — uten å gi bort hele historien. Denne teksten brukes direkte som SoMe-innlegg.

### INGRESS

Åpne med ÉN av disse teknikkene:
- *En levende scene*: Sett leseren inn i et spesifikt, konkret øyeblikk — et rom, en dato, en person i handling
- *Et overraskende faktum*: Start med noe leseren ikke vet og knapt vil tro er sant
- *Et provoserende spørsmål*: Stilt direkte til leseren, som utfordrer en selvsagt antagelse
- *En kontrast*: Still to bilder mot hverandre — frihet og ufrihet, før og etter, ord og handling

Ingressen skal **IKKE røpe konklusjonen**. Den skal skape en spenning som reportasjen løser.

### REPORTASJE

En selvstendig reportasje med overskrifter som starter på nivå 1 (#). Strukturen bør inneholde:
- Historisk kontekst (1–2 avsnitt)
- Hendelsesforløp (2–4 avsnitt)
- Individet-vinkel med evalueringsnøkkelen, NAP og filosofisk tradisjon (1–2 avsnitt)
- Avslutning: Relevans i dag. Avslutt med en setning som kaller til ettertanke — ikke en oppsummering, men et spørsmål eller en observasjon som blir hængende i leseren.

### KILDER

List alle brukte fotnoter fra research-materialet. Skriv kun fotnote-referansene, uten overskrift — overskriften legges til automatisk. Minimum 5 kilder.`
}

// ─── Section parser ─────────────────────────────────────────────────────────

const SECTION_NAMES = [
  'PITCH TIL REDAKTØR',
  'HOOK TIL SOME',
  'INGRESS',
  'REPORTASJE',
  'KILDER',
] as const

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseSections(content: string): Map<string, string> {
  const result = new Map<string, string>()

  for (let i = 0; i < SECTION_NAMES.length; i++) {
    const name = SECTION_NAMES[i]
    const next = SECTION_NAMES[i + 1]

    const pattern = new RegExp(`(?:^|\\n)${escapeRegex(name)}\\s*\\n=+\\s*\\n`)
    const match = pattern.exec(content)
    if (!match) continue

    const start = match.index + match[0].length

    let end = content.length
    if (next) {
      const nextPattern = new RegExp(`\\n${escapeRegex(next)}\\s*\\n=+`)
      const nextMatch = nextPattern.exec(content.slice(start))
      if (nextMatch) {
        end = start + nextMatch.index
      }
    }

    result.set(name, content.slice(start, end).trim())
  }

  return result
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function writeArticle(
  topic: Topic,
  research: ResearchResults,
  images: ArticleImages,
): Promise<Article> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY mangler')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const manifest = await fs.readFile(MANIFEST_PATH, 'utf8')
  const systemPrompt = lagSystemPrompt(manifest)

  const today = new Date().toISOString().split('T')[0]

  const userContent = JSON.stringify(
    {
      topic,
      date: today,
      research,
      images,
    },
    null,
    2,
  )

  console.log(
    `[04-write-article] Kaller Opus for å skrive artikkel om "${topic.title}"...`,
  )

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  })

  const rawText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.Messages.TextBlock).text)
    .join('\n')

  const apiMeta = {
    model: response.model,
    stopReason: response.stop_reason,
    usage: response.usage,
  }

  console.log(
    `[04-write-article] Opus returnerte ${rawText.length} tegn (${apiMeta.usage.input_tokens} in / ${apiMeta.usage.output_tokens} out, stop: ${apiMeta.stopReason})`,
  )

  // ── Parse frontmatter ─────────────────────────────────────────────────────
  const parsed = matter(rawText)

  const fm = parsed.data as Partial<ArticleFrontmatter>

  function resolveField(field: string, value: unknown, fallback: string): string {
    if (value) return String(value)
    console.warn(
      `[04-write-article] Mangler frontmatter-felt ${field} — bruker fallback: "${fallback}"`,
    )
    return fallback
  }

  const frontmatter: ArticleFrontmatter = {
    title: resolveField('title', fm.title, topic.title),
    date: resolveField('date', fm.date, today),
    slug: resolveField('slug', fm.slug, topic.slug),
    description: resolveField('description', fm.description, topic.pitch ?? topic.title),
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
  }

  // ── Parse sections ────────────────────────────────────────────────────────
  const sections = parseSections(parsed.content)

  const pitch = sections.get('PITCH TIL REDAKTØR') ?? ''
  const socialHook = sections.get('HOOK TIL SOME') ?? ''
  const ingress = sections.get('INGRESS') ?? ''
  const body = sections.get('REPORTASJE') ?? ''
  const sources = sections.get('KILDER') ?? ''

  if (!body) {
    throw new Error('Kunne ikke parse REPORTASJE-seksjonen fra Opus-output')
  }

  console.log(
    `[04-write-article] Artikkel validert: slug="${frontmatter.slug}", title="${frontmatter.title}"`,
  )
  console.log(
    `[04-write-article] Seksjoner: pitch=${pitch.length}t, some=${socialHook.length}t, ingress=${ingress.length}t, body=${body.length}t, kilder=${sources.length}t`,
  )

  // ── Build publishable markdown ────────────────────────────────────────────
  const publishableParts = [ingress, body]
  if (sources) {
    publishableParts.push(`## Kilder\n\n${sources}`)
  }
  const publishableMarkdown = matter.stringify(
    '\n' + publishableParts.filter(Boolean).join('\n\n'),
    frontmatter,
  )

  return {
    frontmatter,
    pitch,
    socialHook,
    ingress,
    body,
    sources,
    publishableMarkdown,
    raw: rawText,
    apiMeta,
  }
}
