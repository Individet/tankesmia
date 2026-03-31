import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface ModelStats {
  tasks: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  webSearchRequests: number
}

const PRICING: Record<
  string,
  {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
> = {
  'claude-opus-4-6': {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  'claude-haiku-4-5-20251001': {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
}

function calcWithCache(model: string, s: ModelStats): number {
  const p = PRICING[model]
  if (!p) return 0
  const M = 1_000_000
  return (
    (s.inputTokens / M) * p.input +
    (s.outputTokens / M) * p.output +
    (s.cacheReadTokens / M) * p.cacheRead +
    (s.cacheCreationTokens / M) * p.cacheWrite +
    (s.webSearchRequests / 1000) * 10
  )
}

function calcWithoutCache(model: string, s: ModelStats): number {
  const p = PRICING[model]
  if (!p) return 0
  const M = 1_000_000
  // Uten cache: alle tokens (input + cache read + cache write) faktureres som vanlig input
  const totalInputTokens =
    s.inputTokens + s.cacheReadTokens + s.cacheCreationTokens
  return (
    (totalInputTokens / M) * p.input +
    (s.outputTokens / M) * p.output +
    (s.webSearchRequests / 1000) * 10
  )
}

function emptyStats(): ModelStats {
  return {
    tasks: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    webSearchRequests: 0,
  }
}

function addStats(a: ModelStats, b: ModelStats): void {
  a.tasks += b.tasks
  a.inputTokens += b.inputTokens
  a.outputTokens += b.outputTokens
  a.cacheReadTokens += b.cacheReadTokens
  a.cacheCreationTokens += b.cacheCreationTokens
  a.webSearchRequests += b.webSearchRequests
}

function printModel(model: string, s: ModelStats) {
  const withCache = calcWithCache(model, s)
  const withoutCache = calcWithoutCache(model, s)
  const saved = withoutCache - withCache
  const savedPct = withoutCache > 0 ? (saved / withoutCache) * 100 : 0

  console.log(`  [${model}]`)
  console.log(`    Tasks:              ${s.tasks}`)
  console.log(`    Input tokens:       ${s.inputTokens.toLocaleString()}`)
  console.log(`    Output tokens:      ${s.outputTokens.toLocaleString()}`)
  console.log(`    Cache read tokens:  ${s.cacheReadTokens.toLocaleString()}`)
  console.log(
    `    Cache write tokens: ${s.cacheCreationTokens.toLocaleString()}`,
  )
  console.log(`    Web searches:       ${s.webSearchRequests}`)
  console.log(`    Med cache:          $${withCache.toFixed(4)}`)
  console.log(`    Uten cache:         $${withoutCache.toFixed(4)}`)
  if (saved >= 0) {
    console.log(
      `    Spart:              $${saved.toFixed(4)} (${savedPct.toFixed(1)}%)`,
    )
  } else {
    console.log(
      `    Tap pga cache:      $${Math.abs(saved).toFixed(4)} (cache var ikke lønnsomt)`,
    )
  }
}

async function analyzeBatches(maxBatches = 3) {
  const batches = await client.messages.batches.list()
  const modelTotals: Record<string, ModelStats> = {}

  let batchesCount = 0

  for (const batch of batches.data) {
    if (++batchesCount > maxBatches) {
      console.log(
        `\nReached max batch limit of ${maxBatches}. Stopping analysis.`,
      )
      break
    }
    if (batch.processing_status !== 'ended') {
      console.log(
        `\nBatch: ${batch.id} (${batch.processing_status}) — hopper over`,
      )
      continue
    }

    console.log(`\nBatch: ${batch.id}`)
    const batchModels: Record<string, ModelStats> = {}

    for await (const result of await client.messages.batches.results(
      batch.id,
    )) {
      if (result.result.type !== 'succeeded') continue

      const msg = result.result.message as any
      const model = (msg.model as string) ?? 'unknown'
      const usage = msg.usage

      const s: ModelStats = {
        tasks: 1,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        webSearchRequests: usage.server_tool_use?.web_search_requests ?? 0,
      }

      batchModels[model] ??= emptyStats()
      modelTotals[model] ??= emptyStats()
      addStats(batchModels[model], s)
      addStats(modelTotals[model], s)
    }

    for (const [model, s] of Object.entries(batchModels)) {
      printModel(model, s)
    }
  }

  console.log(`\n${'='.repeat(55)}`)
  console.log('TOTALT PER MODELL\n')

  let grandWithCache = 0
  let grandWithoutCache = 0

  for (const [model, s] of Object.entries(modelTotals)) {
    printModel(model, s)
    grandWithCache += calcWithCache(model, s)
    grandWithoutCache += calcWithoutCache(model, s)
    console.log()
  }

  const grandSaved = grandWithoutCache - grandWithCache
  const grandSavedPct =
    grandWithoutCache > 0 ? (grandSaved / grandWithoutCache) * 100 : 0

  console.log(`${'='.repeat(55)}`)
  console.log(`GRAND TOTAL`)
  console.log(`  Med cache:    $${grandWithCache.toFixed(4)}`)
  console.log(`  Uten cache:   $${grandWithoutCache.toFixed(4)}`)
  if (grandSaved >= 0) {
    console.log(
      `  Totalt spart: $${grandSaved.toFixed(4)} (${grandSavedPct.toFixed(1)}%)`,
    )
  } else {
    console.log(
      `  Tap pga cache: $${Math.abs(grandSaved).toFixed(4)} (cache var ikke lønnsomt)`,
    )
  }
}

analyzeBatches().catch(console.error)
