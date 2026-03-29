import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function countWebSearches() {
  let totalSearches = 0
  let totalTasks = 0
  let totalCost = 0

  const batches = await client.messages.batches.list()

  for (const batch of batches.data) {
    console.log(`\nBatch: ${batch.id} (${batch.processing_status})`)

    if (batch.processing_status !== 'ended') {
      console.log('  → Ikke ferdig, hopper over')
      continue
    }

    let batchSearches = 0
    let batchTasks = 0
    let batchCost = 0

    for await (const result of await client.messages.batches.results(
      batch.id,
    )) {
      batchTasks++

      if (result.result.type === 'succeeded') {
        const searches =
          result.result.message.usage?.server_tool_use?.web_search_requests ?? 0
        batchSearches += searches
      } else {
        console.log(
          `  → Resultat for task ${result.custom_id} mislyktes, type: ${result.result.type}`,
        )
      }
    }

    console.log(`  Tasks: ${batchTasks}`)
    console.log(`  Søk:   ${batchSearches}`)

    totalSearches += batchSearches
    totalTasks += batchTasks
    totalCost += batchCost
  }

  console.log(`\n${'='.repeat(40)}`)
  console.log(`Totalt tasks:  ${totalTasks}`)
  console.log(`Totalt søk:    ${totalSearches}`)
  console.log(`Estimert kostnad: $${((totalSearches / 1000) * 10).toFixed(4)}`)
}

countWebSearches().catch(console.error)
