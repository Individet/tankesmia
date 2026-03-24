/**
 * search-batch.ts
 *
 * Minimal test of the Anthropic Messages Batch API with web_search.
 * Runs a single dimension search (D1: Kroppslig autonomi) for one actor,
 * then writes the complete raw API response to a file.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx ts-node pipelines/search-batch.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

const ACTOR = 'Høyre'
const BATCH_LABEL = 'search-batch-test'
const OUTPUT_FILE = path.join(__dirname, 'search-batch-output.json')
const POLLING_INTERVAL_MS = 30_000

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? (() => { throw new Error('ANTHROPIC_API_KEY mangler') })(),
})

// ── Step 1: Send batch ────────────────────────────────────────────────────────

async function sendBatch(): Promise<string> {
  const batch = await anthropic.messages.batches.create({
    requests: [
      {
        custom_id: `${BATCH_LABEL}-d1`,
        params: {
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: 5,
              user_location: {
                type: 'approximate',
                country: 'NO',
                city: 'Oslo',
                region: 'Oslo',
              },
            },
          ],
          system: `Du er en norsk politisk forsker. Din oppgave er å kartlegge aktørens holdninger til
D1: Kroppslig autonomi og selvbestemmelse (medisinsk selvbestemmelse, livsstilsautonomi,
bevegelsesfrihet, selvbestemmelse ved livets slutt). Bruk web_search til å finne primærkilder.
Returner funna dine som strukturert JSON med feltene: dimensjon, funn (array av {kilde, sitat, vurdering}),
og konklusjon.`,
          messages: [
            {
              role: 'user',
              content: `Innhent evidens om ${ACTOR} sin holdning til kroppslig autonomi og selvbestemmelse.
Analyseperiode: siste 3–5 år. Søk etter: vaksineplikt, koronarestriksjoner, rusmiddelpolitikk,
eutanasi/assistert død, pasientrettigheter, medisinsk frihet. Returner kun JSON.`,
            },
          ],
        },
      },
    ],
  })

  console.log(`Batch sendt: ${batch.id}`)
  return batch.id
}

// ── Step 2: Poll until done ───────────────────────────────────────────────────

async function waitForBatch(batchId: string): Promise<void> {
  for (;;) {
    const batch = await anthropic.messages.batches.retrieve(batchId)
    console.log(`Status: ${batch.processing_status} — ${JSON.stringify(batch.request_counts)}`)
    if (batch.processing_status === 'ended') return
    await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS))
  }
}

// ── Step 3: Fetch results ─────────────────────────────────────────────────────

async function fetchResults(batchId: string): Promise<object[]> {
  const results: object[] = []
  for await (const result of await anthropic.messages.batches.results(batchId)) {
    results.push(result)
  }
  return results
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Kjører search-batch test for: ${ACTOR}`)

  const batchId = await sendBatch()
  await waitForBatch(batchId)
  const results = await fetchResults(batchId)

  const output = {
    batchId,
    actor: ACTOR,
    timestamp: new Date().toISOString(),
    results,
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8')
  console.log(`\nFullstendig output skrevet til: ${OUTPUT_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
