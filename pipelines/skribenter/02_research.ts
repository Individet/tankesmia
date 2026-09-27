import { MODELS } from './constants.ts'
import {
  buildResearchSystemPrompt,
  buildResearchTools,
  buildResearchUserPrompt,
} from './prompts.ts'
import { RESEARCH_OUTPUT_CONFIG } from './schemas.ts'
import type {
  NewsEvent,
  PipelineBatchRequest,
  PipelineBatchResult,
  StoredWriter,
  WriterProfile,
  WriterRegistryEntry,
  WrittenText,
} from './types.ts'
import {
  extractText,
  extractUniqueCitations,
  makeCustomId,
  nowIso,
  parseJsonFromText,
  requireSucceededResult,
} from '../notat/utils.ts'

interface ResearchMeta {
  writerId: string
}

export function buildResearchRequest(
  entry: WriterRegistryEntry,
  stored: StoredWriter | null,
  pendingTexts: WrittenText[],
  pendingEvents: NewsEvent[],
  manifestKort: string,
): PipelineBatchRequest<ResearchMeta> {
  return {
    custom_id: makeCustomId('skribent', entry.id, 'research'),
    meta: { writerId: entry.id },
    params: {
      model: MODELS.research,
      max_tokens: 16000,
      output_config: RESEARCH_OUTPUT_CONFIG,
      system: buildResearchSystemPrompt(manifestKort),
      tools: buildResearchTools(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildResearchUserPrompt(entry, stored, pendingTexts, pendingEvents),
            },
          ],
        },
      ],
    },
  }
}

export function parseResearchResults(
  requests: PipelineBatchRequest<ResearchMeta>[],
  results: Map<string, PipelineBatchResult>,
): { profiles: Map<string, WriterProfile>; failures: Map<string, string> } {
  const profiles = new Map<string, WriterProfile>()
  const failures = new Map<string, string>()

  for (const request of requests) {
    const writerId = request.meta!.writerId
    try {
      const succeeded = requireSucceededResult(results.get(request.custom_id), request.custom_id)
      const parsed = parseJsonFromText<Omit<WriterProfile, 'researchedAt' | 'sources'>>(
        extractText(succeeded),
      )
      const sources = extractUniqueCitations(succeeded).map(({ url, title }) => ({ url, title }))
      profiles.set(writerId, {
        ...parsed,
        texts: (parsed.texts ?? []).map((t) => ({ ...t, foundBy: 'research' as const })),
        sources: dedupeSources(sources),
        researchedAt: nowIso(),
      })
    } catch (error) {
      failures.set(writerId, error instanceof Error ? error.message : String(error))
    }
  }

  return { profiles, failures }
}

function dedupeSources(sources: Array<{ url: string; title: string }>) {
  const seen = new Set<string>()
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
}
