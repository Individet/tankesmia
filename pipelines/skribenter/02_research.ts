import { MAX_TOKENS, MODELS } from './constants.ts'
import {
  buildResearchSystemPrompt,
  buildResearchTools,
  buildResearchUserPrompt,
} from './prompts.ts'
import { RESEARCH_OUTPUT_CONFIG } from './schemas.ts'
import { requireFinalText } from './results.ts'
import { isHttpUrl, sanitizeTexts } from './texts.ts'
import type {
  LinkRef,
  NewsEvent,
  PipelineBatchRequest,
  PipelineBatchResult,
  StoredWriter,
  WriterProfile,
  WriterRegistryEntry,
  WriterImage,
  WrittenText,
} from './types.ts'
import {
  extractUniqueCitations,
  makeCustomId,
  nowIso,
  parseJsonFromText,
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
      max_tokens: MAX_TOKENS.research,
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
      const { text, succeeded } = requireFinalText(results.get(request.custom_id), request.custom_id)
      const parsed = parseJsonFromText<Omit<WriterProfile, 'researchedAt' | 'sources'>>(text)
      if (!parsed.name?.trim() || !parsed.tagline?.trim()) {
        throw new Error('research-svaret mangler navn eller tagline')
      }
      const sources = extractUniqueCitations(succeeded)
        .filter((s) => isHttpUrl(s.url))
        .map(({ url, title }) => ({ url, title }))
      profiles.set(writerId, {
        ...parsed,
        image: sanitizeImage(parsed.image),
        platforms: sanitizeLinks(parsed.platforms),
        links: sanitizeLinks(parsed.links),
        keyFacts: parsed.keyFacts ?? [],
        freedomContributions: parsed.freedomContributions ?? [],
        themes: parsed.themes ?? [],
        texts: sanitizeTexts(parsed.texts ?? []).map((t) => ({ ...t, foundBy: 'research' as const })),
        sources: dedupeSources(sources),
        researchedAt: nowIso(),
      })
    } catch (error) {
      failures.set(writerId, error instanceof Error ? error.message : String(error))
    }
  }

  return { profiles, failures }
}

function sanitizeLinks(links: LinkRef[] | undefined): LinkRef[] {
  return (links ?? []).filter((l) => l?.type && isHttpUrl(l.url))
}

function sanitizeImage(image: WriterImage | null | undefined): WriterImage | null {
  if (!image || !isHttpUrl(image.url)) return null
  return { ...image, sourcePage: isHttpUrl(image.sourcePage) ? image.sourcePage : undefined }
}

function dedupeSources(sources: Array<{ url: string; title: string }>) {
  const seen = new Set<string>()
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
}
