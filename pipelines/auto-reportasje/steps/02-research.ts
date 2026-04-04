import Anthropic from '@anthropic-ai/sdk'
import { promises as fs } from 'fs'
import path from 'path'
import type { Topic } from './01-choose-topic.ts'

export type ResearchResults = Record<string, string>

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 5000
const POLLING_INTERVAL_MS = 30_000
const MANIFEST_PATH = path.join('manifest-kondensert.md')

const SUB_TOPICS = [
  {
    id: 'background',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}). Finn den historiske bakgrunnen og konteksten.\n\nGjør minst 5 nettsøk. For hvert funn: gjengi de relevante passasjene ORDRETT fra kilden. Ikke skriv egne oppsummeringer — kun siterte passasjer med kort kontekst om hva passasjen handler om.`,
  },
  {
    id: 'key-events',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}). Finn de viktigste hendelsene i kronologisk rekkefølge.\n\nGjør minst 5 nettsøk. For hvert funn: gjengi de relevante passasjene ORDRETT fra kilden. Ikke skriv egne oppsummeringer — kun siterte passasjer med kort kontekst om hva passasjen handler om.`,
  },
  {
    id: 'people',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}). Finn de sentrale personene som var involvert — hvem de var, hvilken rolle de spilte, og konsekvensene for dem.\n\nGjør minst 5 nettsøk. For hvert funn: gjengi de relevante passasjene ORDRETT fra kilden. Ikke skriv egne oppsummeringer — kun siterte passasjer med kort kontekst om hva passasjen handler om.`,
  },
  {
    id: 'quotes',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}). Finn direkte sitater fra primærkilder eller sentrale aktører — hvem sa det, når, og i hvilken sammenheng.\n\nGjør minst 5 nettsøk. For hvert funn: gjengi de relevante passasjene ORDRETT fra kilden. Ikke skriv egne oppsummeringer — kun siterte passasjer med kort kontekst om hva passasjen handler om.`,
  },
  {
    id: 'legacy',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}). Finn informasjon om ettervirkningen og relevansen i dag — hva verden lærte og hvilke konsekvenser det har hatt.\n\nGjør minst 5 nettsøk. For hvert funn: gjengi de relevante passasjene ORDRETT fra kilden. Ikke skriv egne oppsummeringer — kun siterte passasjer med kort kontekst om hva passasjen handler om.`,
  },
  {
    id: 'individet-angle',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}). Finn informasjon som belyser koblingen til individuell suverenitet, Non-Aggression Principle (NAP), og konflikten mellom individets frihet og statlig makt.\n\nGjør minst 5 nettsøk. For hvert funn: gjengi de relevante passasjene ORDRETT fra kilden. Ikke skriv egne oppsummeringer — kun siterte passasjer med kort kontekst om hva passasjen handler om.`,
  },
]

function lagCustomId(slug: string, subTopic: string): string {
  return `${slug}_${subTopic}`
}

function lagSystemPrompt(
  manifest: string,
): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }> {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en research-agent for tenketanken Individet (individet.no).',
        'Du skriver på norsk bokmål.',
        '',
        'VIKTIG: Din jobb er KUN å finne og sitere relevante kilder. Du skal IKKE skrive egne analyser, oppsummeringer eller konklusjoner.',
        '',
        'For hvert funn du gjør:',
        '1. Gjør et nettsøk',
        '2. Les kilden',
        '3. Gjengi de relevante passasjene ORDRETT slik de står i kilden',
        '4. Legg til 1-2 setninger kontekst om hva passasjen handler om',
        '',
        'ALDRI list kilder eller URLer i teksten! De blir lagt på automatisk via citations.',
        'Skriv: "Ifølge artikkelen ..." etterfulgt av den ordrett siterte passasjen.',
        'ALDRI SKRIV: "Ifølge [tittel](url)" — dette er unødvendig.',
        '',
        'Du vurderer kilders relevans i tråd med Individets verdigrunnlag fra manifestet under.',
        '',
        '--- START MANIFEST: INDIVIDETS SUVERENITET ---',
        manifest,
        '--- SLUTT MANIFEST ---',
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

function lagBatchRequests(
  topic: Topic,
  system: Array<{
    type: 'text'
    text: string
    cache_control: { type: 'ephemeral' }
  }>,
): Array<{
  custom_id: string
  params: Anthropic.Messages.MessageCreateParamsNonStreaming
}> {
  return SUB_TOPICS.map((sub) => ({
    custom_id: lagCustomId(topic.slug, sub.id),
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: [
        {
          type: 'web_search_20250305' as const,
          name: 'web_search' as const,
        },
      ],
      messages: [
        {
          role: 'user' as const,
          content: sub.prompt(topic.slug, topic.title),
        },
      ],
    },
  }))
}

// ─── Citation types matching web_search_20250305 output ─────────────────────

type Citation = {
  type: 'web_search_result_location'
  cited_text: string
  url: string
  title: string
}

type ContentBlock = {
  type: 'text' | 'server_tool_use' | 'web_search_tool_result'
  text: string
  citations?: Citation[]
}

/**
 * Extracts text with inline footnotes from a message that contains
 * web_search citations. Produces markdown with a ## Kilder section.
 * Modelled after tolkMarkdownFil in isi-rangering/01_search_pipeline.ts.
 */
function extractTextWithCitations(message: Anthropic.Messages.Message): string {
  const blocks = message.content as ContentBlock[]

  // Find the last non-text block (tool use / tool result) so we only
  // process the assistant's final text output, not intermediate tool calls.
  const lastNonTextIndex = blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.type !== 'text')
    .map(({ i }) => i)
    .at(-1)

  const startIndex =
    typeof lastNonTextIndex === 'number' ? lastNonTextIndex + 1 : 0

  const textBlocks = blocks.slice(startIndex).filter((b) => b.type === 'text')

  const footnoteIndexByKey = new Map<string, number>()
  const footnotes: string[] = []

  const body = textBlocks
    .map((block) => {
      const citations = block.citations ?? []

      if (citations.length === 0) {
        return block.text
      }

      const markers = citations.map((c) => {
        const key = `${c.url}__${c.cited_text}`
        const existing = footnoteIndexByKey.get(key)

        if (existing) {
          return `[^${existing}]`
        }

        const next = footnotes.length + 1
        footnoteIndexByKey.set(key, next)
        footnotes.push(`[^${next}]: "${c.cited_text}" – [${c.title}](${c.url})`)

        return `[^${next}]`
      })

      return `${block.text}${markers.join('')}`
    })
    .join('')

  if (footnotes.length === 0) {
    return body
  }

  return `${body}\n\n## Kilder\n\n${footnotes.join('\n')}`
}

export async function doResearch(topic: Topic): Promise<{
  results: ResearchResults
  rawBatch: unknown
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY mangler')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const manifest = await fs.readFile(MANIFEST_PATH, 'utf8')
  const systemPrompt = lagSystemPrompt(manifest)
  const requests = lagBatchRequests(topic, systemPrompt)

  console.log(
    `[02-research] Oppretter batch med ${requests.length} requests for "${topic.title}"...`,
  )

  const batch = await client.messages.batches.create({ requests })
  console.log(
    `[02-research] Batch opprettet: ${batch.id}. Poller til ferdig...`,
  )

  let currentBatch = batch
  while (currentBatch.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS))
    currentBatch = await client.messages.batches.retrieve(batch.id)
    console.log(
      `[02-research] Batch ${batch.id} status: ${currentBatch.processing_status} (succeeded: ${currentBatch.request_counts.succeeded}, errored: ${currentBatch.request_counts.errored})`,
    )
  }

  console.log(`[02-research] Batch ferdig. Henter resultater...`)

  const results: ResearchResults = {}
  const rawResults: unknown[] = []

  for await (const result of await client.messages.batches.results(batch.id)) {
    rawResults.push(result)
    if (result.result.type === 'succeeded') {
      results[result.custom_id] = extractTextWithCitations(
        result.result.message,
      )
    } else {
      console.warn(
        `[02-research] Request ${result.custom_id} feilet: ${result.result.type}`,
      )
    }
  }

  console.log(
    `[02-research] Hentet ${Object.keys(results).length}/${requests.length} vellykkede resultater`,
  )

  return {
    results,
    rawBatch: {
      batchId: batch.id,
      topic,
      results: rawResults,
    },
  }
}
