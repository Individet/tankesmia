import type { PipelineBatchResult } from './types.ts'
import { extractText, requireSucceededResult } from '../notat/utils.ts'

/**
 * Henter sluttteksten fra et batch-resultat, og feiler med en tydelig melding
 * når svaret ikke kan brukes:
 *
 * - `errored` / `expired` / `canceled` og `max_tokens` (via requireSucceededResult)
 * - `refusal`: modellens sikkerhetsfilter avslo; teksten er da tom eller avkuttet
 * - `pause_turn`: modellen ble stoppet midt i websøkene og har ikke skrevet svaret
 * - tomt svar
 */
export function requireFinalText(result: PipelineBatchResult | undefined, customId: string): {
  text: string
  succeeded: ReturnType<typeof requireSucceededResult>
} {
  const succeeded = requireSucceededResult(result, customId)
  if (succeeded.stopReason === 'refusal') {
    throw new Error(`[${customId}] Modellen avslo forespørselen (stop_reason=refusal).`)
  }
  if (succeeded.stopReason === 'pause_turn') {
    throw new Error(
      `[${customId}] Modellen ble avbrutt midt i websøkene (stop_reason=pause_turn) og skrev aldri et svar.`,
    )
  }
  const text = extractText(succeeded)
  if (!text.trim()) throw new Error(`[${customId}] Tomt svar fra modellen (stop_reason=${succeeded.stopReason}).`)
  return { text, succeeded }
}
