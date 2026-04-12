import Anthropic from '@anthropic-ai/sdk'
import { writeJsonFile } from './utils.ts'

async function main() {
  const batchId = process.argv[2]
  if (!batchId) {
    console.error('Bruk: tsx pipelines/isi-ranking/dump-batch.ts <batch-id>')
    process.exit(1)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY mangler.')
    process.exit(1)
  }

  const client = new Anthropic({ apiKey })

  console.log(`Henter batch ${batchId}...`)
  const batch = await client.messages.batches.retrieve(batchId)
  console.log(`Status: ${batch.processing_status}, ok=${batch.request_counts.succeeded}, feil=${batch.request_counts.errored}`)

  console.log('Henter resultater...')
  const results: Record<string, unknown> = {}
  for await (const result of await client.messages.batches.results(batchId)) {
    results[result.custom_id] = result
  }

  const outPath = `${batchId}.json`
  await writeJsonFile(outPath, { batch, results })
  console.log(`Ferdig — ${Object.keys(results).length} resultater skrevet til ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
