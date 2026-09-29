import { MAX_TOKENS, MODELS } from './constants.ts'
import {
  buildChangeCheckSystemPrompt,
  buildChangeCheckTools,
  buildChangeCheckUserPrompt,
} from './prompts.ts'
import { requireFinalText } from './results.ts'
import { CHANGE_CHECK_OUTPUT_CONFIG } from './schemas.ts'
import { isHttpUrl, sanitizeTexts } from './texts.ts'
import type {
  ChangeCheckResult,
  PipelineBatchRequest,
  PipelineBatchResult,
  StoredWriter,
  WriterRegistryEntry,
  WrittenText,
} from './types.ts'
import { makeCustomId, nowIso, parseJsonFromText } from '../notat/utils.ts'

interface ChangeCheckMeta {
  writerId: string
}

export function buildChangeCheckRequest(
  entry: WriterRegistryEntry,
  stored: StoredWriter,
  feedTexts: WrittenText[],
): PipelineBatchRequest<ChangeCheckMeta> {
  return {
    custom_id: makeCustomId('skribent', entry.id, 'check'),
    meta: { writerId: entry.id },
    params: {
      model: MODELS.changeCheck,
      max_tokens: MAX_TOKENS.changeCheck,
      output_config: CHANGE_CHECK_OUTPUT_CONFIG,
      system: buildChangeCheckSystemPrompt(),
      tools: buildChangeCheckTools(),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildChangeCheckUserPrompt(entry, stored, feedTexts) },
          ],
        },
      ],
    },
  }
}

/**
 * En endringssjekk som feiler skal ikke velte hele kjøringen — da hopper vi
 * bare over skribenten denne gangen (den gamle profilen står).
 */
export function parseChangeCheckResults(
  requests: PipelineBatchRequest<ChangeCheckMeta>[],
  results: Map<string, PipelineBatchResult>,
): { checks: Map<string, ChangeCheckResult>; failures: Map<string, string> } {
  const checks = new Map<string, ChangeCheckResult>()
  const failures = new Map<string, string>()

  for (const request of requests) {
    const writerId = request.meta!.writerId
    try {
      const { text } = requireFinalText(results.get(request.custom_id), request.custom_id)
      const parsed = parseJsonFromText<Omit<ChangeCheckResult, 'writerId' | 'checkedAt'>>(text)
      checks.set(writerId, {
        writerId,
        checkedAt: nowIso(),
        newTexts: sanitizeTexts(parsed.newTexts ?? []).map((t) => ({ ...t, foundBy: 'change-check' as const })),
        events: (parsed.events ?? [])
          .filter((e) => e?.description?.trim())
          .map(({ url, ...e }) => (isHttpUrl(url) ? { ...e, url } : e)),
        notes: parsed.notes ?? '',
      })
    } catch (error) {
      failures.set(writerId, error instanceof Error ? error.message : String(error))
    }
  }

  return { checks, failures }
}
