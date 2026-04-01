import Anthropic from '@anthropic-ai/sdk'
import matter from 'gray-matter'
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
const MAX_TOKENS = 4000

const SYSTEM_PROMPT = `Du er en journalist og skribent for tenketanken Individet (individet.no).

## Individets profil og verdier
Individet er en norsk tenketank dedikert til prinsippet om individuell suverenitet, selvbestemmelse og frihet fra tvang. Kjerneverdiene er:
- **Selv-eierskap**: Hvert individ eier seg selv og sin kropp
- **Non-Aggression Principle (NAP)**: Ingen har rett til å bruke vold eller tvang mot et fredelig individ
- **Frihet > tvang**: Frivillige løsninger er alltid å foretrekke over statlig tvang
- **Eiendomsrett**: Rettmessig ervervet eiendom er ukrenkelig
- **Skeptisk til statsmakt**: Staten bør ha minimal innflytelse over individets liv

## Språk og stil
- Skriv på norsk bokmål
- Journalistisk og engasjerende stil
- Faktuell og kildekritisk
- Knytter historiske eksempler til universelle prinsipper om frihet

## Artikkelstruktur
Artikkelen skal følge denne strukturen:
1. **Ingress** (2-3 setninger): Fang leseren, introduser emnet
2. **Historisk kontekst** (1-2 avsnitt): Bakgrunn og setting
3. **Hendelsesforløp** (2-4 avsnitt): Hva skjedde, kronologisk
4. **Individet-vinkel** (1-2 avsnitt): Kobling til NAP, individuell frihet og Individets verdier
5. **Avslutning** (1 avsnitt): Relevans i dag, ettertanke

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

export async function writeArticle(
  topic: Topic,
  research: ResearchResults,
  images: ArticleImages,
): Promise<Article> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY mangler')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
    system: SYSTEM_PROMPT,
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
