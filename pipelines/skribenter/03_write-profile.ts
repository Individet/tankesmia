import { MAX_TOKENS, MODELS } from './constants.ts'
import { requireFinalText } from './results.ts'
import { buildWriterSystemPrompt, buildWriterUserPrompt } from './prompts.ts'
import type {
  PipelineBatchRequest,
  PipelineBatchResult,
  WriterProfile,
  WriterRegistryEntry,
} from './types.ts'
import { makeCustomId } from '../notat/utils.ts'

interface WriteMeta {
  writerId: string
}

export function buildWriteProfileRequest(
  entry: WriterRegistryEntry,
  profile: WriterProfile,
  previousBody: string | null,
  manifest: string,
  styleGuide: string,
): PipelineBatchRequest<WriteMeta> {
  return {
    custom_id: makeCustomId('skribent', entry.id, 'write'),
    meta: { writerId: entry.id },
    params: {
      model: MODELS.writeProfile,
      max_tokens: MAX_TOKENS.writeProfile,
      system: buildWriterSystemPrompt(manifest, styleGuide),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildWriterUserPrompt(entry, profile, previousBody) },
          ],
        },
      ],
    },
  }
}

/** Fjerner ting modellen er bedt om å la være (frontmatter, H1), for sikkerhets skyld. */
export function cleanBody(markdown: string): string {
  return markdown
    .replace(/^\s*---\n[\s\S]*?\n---\n/, '')
    .replace(/^\s*#\s+.*\n/, '')
    .trim()
}

/** Kortere enn dette er nesten alltid et avbrutt eller mislykket svar. */
const MIN_BODY_WORDS = 120

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

export function parseWriteProfileResults(
  requests: PipelineBatchRequest<WriteMeta>[],
  results: Map<string, PipelineBatchResult>,
): { bodies: Map<string, string>; failures: Map<string, string> } {
  const bodies = new Map<string, string>()
  const failures = new Map<string, string>()

  for (const request of requests) {
    const writerId = request.meta!.writerId
    try {
      const { text } = requireFinalText(results.get(request.custom_id), request.custom_id)
      const body = cleanBody(text)
      if (!body) throw new Error('tomt svar etter opprensking')
      if (countWords(body) < MIN_BODY_WORDS) {
        throw new Error(`profilteksten er bare ${countWords(body)} ord (minimum ${MIN_BODY_WORDS})`)
      }
      bodies.set(writerId, body)
    } catch (error) {
      failures.set(writerId, error instanceof Error ? error.message : String(error))
    }
  }

  return { bodies, failures }
}
