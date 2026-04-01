import Anthropic from '@anthropic-ai/sdk'
import type { Topic } from './01-choose-topic.ts'

export type ResearchResults = Record<string, string>

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 1024
const POLLING_INTERVAL_MS = 30_000

const SUB_TOPICS = [
  {
    id: 'background',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}) og skriv en grundig redegjørelse for den historiske bakgrunnen og konteksten. Fokuser på faktabasert informasjon fra pålitelige kilder.`,
  },
  {
    id: 'key-events',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}) og list opp de viktigste hendelsene i kronologisk rekkefølge. Beskriv hva som skjedde, når og hvorfor det var betydningsfullt.`,
  },
  {
    id: 'people',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}) og beskriv de sentrale personene som var involvert. For hver person: hvem var de, hvilken rolle spilte de, og hva ble konsekvensene for dem?`,
  },
  {
    id: 'quotes',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}) og finn direkte sitater fra primærkilder eller sentrale aktører. Angi hvem som sa det, i hvilken sammenheng og omtrentlig dato.`,
  },
  {
    id: 'legacy',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}) og beskriv ettervirkningen og relevansen i dag. Hva lærte verden av dette? Hvilke konsekvenser har det hatt frem til i dag?`,
  },
  {
    id: 'individet-angle',
    prompt: (slug: string, title: string) =>
      `Gjør research på emnet "${title}" (slug: ${slug}) og analyser koblingen til individuell suverenitet og Non-Aggression Principle (NAP). Hvordan illustrerer dette emnet konflikten mellom individets frihet og statlig makt? Hvilke prinsipper fra frihetstradisjonen er relevante?`,
  },
]

function lagCustomId(slug: string, subTopic: string): string {
  return `${slug}_${subTopic}`
}

function lagBatchRequests(
  topic: Topic,
): Array<{
  custom_id: string
  params: Anthropic.Messages.MessageCreateParamsNonStreaming
}> {
  return SUB_TOPICS.map((sub) => ({
    custom_id: lagCustomId(topic.slug, sub.id),
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
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

function extractText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as Anthropic.Messages.TextBlock).text)
    .join('\n')
}

export async function doResearch(topic: Topic): Promise<{
  results: ResearchResults
  rawBatch: unknown
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY mangler')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const requests = lagBatchRequests(topic)

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
      results[result.custom_id] = extractText(result.result.message)
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
