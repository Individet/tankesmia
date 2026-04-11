import Anthropic from '@anthropic-ai/sdk'
import type {
  BatchTransport,
  BatchUsage,
  PipelineBatchRequest,
  PipelineBatchResult,
} from './types.ts'

const POLLING_INTERVAL_MS = 60_000

function getUsage(message: any): BatchUsage {
  const usage = message?.usage ?? {}

  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    webSearchRequests: usage.server_tool_use?.web_search_requests ?? 0,
  }
}

export class LiveAnthropicBatchTransport implements BatchTransport {
  private client: Anthropic

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY mangler. Sett miljo-variabelen.')
    }

    this.client = new Anthropic({ apiKey })
  }

  async createBatch(
    requests: PipelineBatchRequest[],
    label: string,
  ): Promise<string> {
    const batch = await this.client.messages.batches.create({
      requests: requests.map(({ meta: _meta, ...request }) => request),
    })
    console.log(`[batch] Opprettet ${label}: ${batch.id} (${requests.length} kall)`)
    return batch.id
  }

  async waitForBatch(batchId: string, label: string): Promise<void> {
    console.log(`[batch] Venter på ${batchId} (${label})...`)

    for (;;) {
      const batch = await this.client.messages.batches.retrieve(batchId)
      if (batch.processing_status === 'ended') {
        console.log(
          `[batch] ${batchId} ferdig — ok=${batch.request_counts.succeeded}, feil=${batch.request_counts.errored}`,
        )
        return
      }

      console.log(
        `[batch] ${batchId} status=${batch.processing_status} — ok=${batch.request_counts.succeeded}, feil=${batch.request_counts.errored}`,
      )

      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS))
    }
  }

  async getBatchResults(batchId: string): Promise<Map<string, PipelineBatchResult>> {
    const results = new Map<string, PipelineBatchResult>()

    for await (const result of await this.client.messages.batches.results(batchId)) {
      if (result.result.type === 'succeeded') {
        results.set(result.custom_id, {
          type: 'succeeded',
          model: result.result.message.model,
          stopReason: result.result.message.stop_reason,
          usage: getUsage(result.result.message),
          content: result.result.message.content.map((block) => {
            if (block.type === 'text') {
              return {
                type: 'text' as const,
                text: block.text,
                citations: block.citations?.map((citation) => ({
                  url: citation.url,
                  title: citation.title,
                  citedText:
                    'cited_text' in citation ? citation.cited_text ?? undefined : undefined,
                })),
              }
            }

            return block as unknown as { type: string; [key: string]: unknown }
          }),
        })
        continue
      }

      results.set(result.custom_id, {
        type: result.result.type,
        error: 'error' in result.result ? result.result.error : undefined,
      })
    }

    return results
  }
}
