/**
 * If some script got aborted after starting a batch, this script can be used to wait for the batch to finish and then fetch all results.
 */
import Anthropic from '@anthropic-ai/sdk'

type BatchResult =
  Awaited<
    ReturnType<Anthropic['messages']['batches']['results']>
  > extends AsyncIterable<infer T>
    ? T
    : never

const POLLING_INTERVAL_MS = 30_000

function parseArgs(argv: string[]): { batchId: string; wait: boolean } {
  const args = argv.slice(2)
  const wait = !args.includes('--no-wait')
  const batchId = args.find((arg) => !arg.startsWith('-'))

  if (!batchId) {
    console.error('Bruk: npx tsx wait_for_batch.ts <batchId> [--no-wait]')
    process.exit(1)
  }

  return { batchId, wait }
}

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY mangler i miljo-variabler.')
  }

  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntilEnded(
  client: Anthropic,
  batchId: string,
  wait: boolean,
): Promise<Awaited<ReturnType<Anthropic['messages']['batches']['retrieve']>>> {
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId)
    if (batch.processing_status === 'ended') {
      return batch
    }

    if (!wait) {
      throw new Error(
<<<<<<< HEAD
        `Batch ${batchId} er ikke ferdig (status: ${batch.processing_status}). Kjør uten --no-wait for å vente.`,
=======
        `Batch ${batchId} er ikke ferdig (status: ${batch.processing_status}). Kjor uten --no-wait for a vente.`,
>>>>>>> b9ea85f... WIP
      )
    }

    console.error(
<<<<<<< HEAD
      `Venter på batch ${batchId}. Status: ${batch.processing_status}. Succeeded: ${batch.request_counts.succeeded}, Errored: ${batch.request_counts.errored}`,
=======
      `Venter pa batch ${batchId}. Status: ${batch.processing_status}. Succeeded: ${batch.request_counts.succeeded}, Errored: ${batch.request_counts.errored}`,
>>>>>>> b9ea85f... WIP
    )
    await sleep(POLLING_INTERVAL_MS)
  }
}

async function fetchAllResults(
  client: Anthropic,
  batchId: string,
): Promise<BatchResult[]> {
  const results: BatchResult[] = []

  for await (const result of await client.messages.batches.results(batchId)) {
    results.push(result)
  }

  return results
}

async function main(): Promise<void> {
  const { batchId, wait } = parseArgs(process.argv)
  const client = getClient()

  const batch = await waitUntilEnded(client, batchId, wait)
  const results = await fetchAllResults(client, batchId)

  const payload = {
    batchId,
    processingStatus: batch.processing_status,
    requestCounts: batch.request_counts,
    endedAt: batch.ended_at,
    results,
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

main().catch((error) => {
  console.error('Feil ved henting av batch:', error)
  process.exit(1)
})
