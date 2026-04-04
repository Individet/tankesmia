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
  content: string
  raw: string
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

Bruk disse tre linsene aktivt i artikkelen:

1. **Evalueringsnøkkelen:** For hvert politisk tiltak, historisk hendelse eller aktør: *Øker dette den enkeltes kontroll over sitt eget liv — eller overfører det kontroll til staten?* Dette spørsmålet skal være artikkelens analytiske kjerne når emnet kobles til Individets perspektiv.

2. **Intensjonsimmunitet:** Gode intensjoner rettferdiggjør ikke tvang. Positive utfall rettferdiggjør ikke tvang. Illustrer gjerne hvordan velmenende aktører eller regimer rettferdiggjorde overgrepene i ditt emne med gode intensjoner.

3. **Den filosofiske slektslinjen:** Manifestet bygger på en klar intellektuell tradisjon — Aristoteles, Stoikerne, Locke, Bastiat, Hayek, Paterson, Spooner. Der det er naturlig, sett emnet inn i denne tradisjonen: Hvem av disse tenkerne belyser det som skjedde? Hva ville Bastiat eller Hayek sagt om dette?

## Språk og stil

- Skriv på norsk bokmål
- Manifestets stemme: kraftig, direkte, med filosofiske referanser der det styrker teksten
- Faktuell og kildekritisk — bygg på research-materialet, ikke på egne påstander
- Variert tempostyring: korte setninger for dramatikk, lengre for kontekst og resonans
- Hold spenningen stigende gjennom artikkelen frem mot konklusjonen

## Artikkelstruktur

Artikkelen skal følge denne strukturen:

1. **Hook / ingress** (2–4 setninger): Åpne med ÉN av disse teknikkene:
   - *En levende scene*: Sett leseren inn i et spesifikt, konkret øyeblikk i historien — et rom, en dato, en person i handling
   - *Et overraskende faktum*: Start med noe leseren ikke vet og knapt vil tro er sant
   - *Et provoserende spørsmål*: Stilt direkte til leseren, som utfordrer en selvsagt antagelse
   - *En kontrast*: Still to bilder mot hverandre — frihet og ufrihet, før og etter, ord og handling

   Ingressen skal **IKKE røpe konklusjonen**. Den skal skape en spenning som artikkelen løser.

2. **Historisk kontekst** (1–2 avsnitt): Bakgrunn og setting. Hvem, hva, når, hvor.

3. **Hendelsesforløp** (2–4 avsnitt): Hva skjedde, kronologisk. Vær konkret og faktabasert.

4. **Individet-vinkel** (1–2 avsnitt): Kobling til evalueringsnøkkelen, NAP og Individets verdier. Bruk gjerne den filosofiske tradisjonen. Adressér intensjonsimmunitet der det er relevant.

5. **Avslutning** (1 avsnitt): Relevans i dag. Avslutt med en setning som kaller til ettertanke — ikke en oppsummering, men et spørsmål eller en observasjon som blir hængende i leseren.

## Kildebruk

Research-materialet inneholder direkte sitater med fotnoter ([^1], [^2], ...) og tilhørende kildeliste. Bruk disse aktivt:
- Sitér relevante passasjer i artikkelen der de styrker argumentasjonen
- Behold fotnote-referansene når du siterer
- Artikkelen MÅ avsluttes med en \`## Kilder\`-seksjon som lister opp alle brukte fotnoter fra research-materialet. Minimumsantall: 5 kilder.

## Bildereferanser

Bruk inline-bilder slik: \`![alt-tekst](bilde-id)\` der \`bilde-id\` er verdien fra ImageMeta.id-feltet.
Hero-bildet inkluderes ikke inline — det plasseres automatisk øverst.

## YAML frontmatter

Artikkelen MÅ begynne med YAML frontmatter i dette formatet:
\`\`\`yaml
---
title: "Tittel på artikkelen"
date: YYYY-MM-DD
slug: emne-slug
description: "Kort beskrivelse på 1-2 setninger for søkemotorer og forhåndsvisning"
tags: [tag1, tag2, tag3]
---
\`\`\`

Generer fullstendig artikkel med frontmatter.`
}

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

  console.log(`[04-write-article] Opus returnerte ${rawText.length} tegn`)

  const parsed = matter(rawText)

  const fm = parsed.data as Partial<ArticleFrontmatter>

  if (!fm.slug) throw new Error('Artikkelen mangler frontmatter-felt: slug')
  if (!fm.title) throw new Error('Artikkelen mangler frontmatter-felt: title')
  if (!fm.date) throw new Error('Artikkelen mangler frontmatter-felt: date')
  if (!fm.description)
    throw new Error('Artikkelen mangler frontmatter-felt: description')

  const frontmatter: ArticleFrontmatter = {
    title: String(fm.title),
    date: String(fm.date),
    slug: String(fm.slug),
    description: String(fm.description),
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
  }

  console.log(
    `[04-write-article] Artikkel validert: slug="${frontmatter.slug}", title="${frontmatter.title}"`,
  )

  return {
    frontmatter,
    content: parsed.content,
    raw: rawText,
  }
}
