import Anthropic from '@anthropic-ai/sdk'

// ─── Typer ────────────────────────────────────────────────────────────────────

export interface TokenForbruk {
  inputTokens: number
  outputTokens: number
}

export interface BatchResultat {
  innhold: string
  tokenForbruk: TokenForbruk
}

type BatchResultaterStream = Awaited<
  ReturnType<Anthropic['messages']['batches']['results']>
>

export type BatchResultatRå =
  BatchResultaterStream extends AsyncIterable<infer T> ? T : never

export interface BatchTokenForbruk {
  batchId: string
  requests: Array<{
    customId: string
    inputTokens: number
    outputTokens: number
  }>
}

type BatchCreateRequests = Parameters<
  Anthropic['messages']['batches']['create']
>[0]['requests']

export type BatchRequest = BatchCreateRequests[number]

// ─── Klient ───────────────────────────────────────────────────────────────────

const POLLING_INTERVAL_MS = 60_000

let anthropicClient: Anthropic | undefined

function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY mangler. Sett variabelen.')
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropicClient
}

// ─── Batch-operasjoner ────────────────────────────────────────────────────────

export async function sendBatch(
  requests: BatchRequest[],
  _label: string,
): Promise<string> {
  const anthropic = getAnthropicClient()
  const batch = await anthropic.messages.batches.create({ requests })
  return batch.id
}

export async function ventPåBatch(
  batchId: string,
  label: string,
): Promise<void> {
  console.log(`  Venter på batch ${batchId} (${label})...`)
  const anthropic = getAnthropicClient()
  for (;;) {
    const batch = await anthropic.messages.batches.retrieve(batchId)
    if (batch.processing_status === 'ended') {
      console.log(
        `  Batch ${batchId} ferdig. Succeeded: ${batch.request_counts.succeeded}, Errored: ${batch.request_counts.errored}`,
      )
      return
    } else {
      console.log(
        `  Batch ${batchId} status: ${batch.processing_status}. Succeeded: ${batch.request_counts.succeeded}, Errored: ${batch.request_counts.errored}`,
      )
    }
    await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS))
  }
}

export async function hentBatchResultater(
  batchId: string,
): Promise<Map<string, BatchResultat>> {
  const resultater = new Map<string, BatchResultat>()
  const anthropic = getAnthropicClient()

  for await (const result of await anthropic.messages.batches.results(
    batchId,
  )) {
    if (result.result.type === 'succeeded') {
      const content = result.result.message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('\n')
      resultater.set(result.custom_id, {
        innhold: content,
        tokenForbruk: {
          inputTokens: result.result.message.usage.input_tokens,
          outputTokens: result.result.message.usage.output_tokens,
        },
      })
    } else {
      const feildetaljer = JSON.stringify(result.result, null, 2)
      console.warn(
        `  Advarsel: request ${result.custom_id} feilet (${result.result.type})`,
      )
      console.warn(`  Feildetaljer for ${result.custom_id}:\n${feildetaljer}`)
    }
  }

  return resultater
}

export async function hentBatchResultaterRaw(
  batchId: string,
): Promise<Map<string, BatchResultatRå>> {
  const resultater = new Map<string, BatchResultatRå>()
  const anthropic = getAnthropicClient()

  for await (const result of await anthropic.messages.batches.results(
    batchId,
  )) {
    resultater.set(result.custom_id, result)
  }

  return resultater
}
