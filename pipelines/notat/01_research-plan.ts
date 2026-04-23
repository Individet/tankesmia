import { MODELS } from './constants.ts'
import {
  buildResearchPlanSystemPrompt,
  buildResearchPlanUserPrompt,
  buildResearchTools,
  researchPlanMarkdown,
} from './prompts.ts'
import { RESEARCH_PLAN_OUTPUT_CONFIG } from './schemas.ts'
import type {
  NotatInput,
  NotatResearchPlan,
  PipelineBatchRequest,
} from './types.ts'
import {
  extractText,
  makeCustomId,
  nowIso,
  parseJsonFromText,
  requireSucceededResult,
} from './utils.ts'

interface ResearchPlanMeta {
  notatSlug: string
}

export function buildResearchPlanRequest(
  input: NotatInput,
  notatSlug: string,
  manifest: string,
  formatGuide: string,
): PipelineBatchRequest<ResearchPlanMeta> {
  return {
    custom_id: makeCustomId(notatSlug, 'research-plan'),
    meta: { notatSlug },
    params: {
      model: MODELS.researchPlan,
      max_tokens: 16000,
      output_config: RESEARCH_PLAN_OUTPUT_CONFIG,
      system: buildResearchPlanSystemPrompt(manifest, formatGuide),
      tools: buildResearchTools(8),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildResearchPlanUserPrompt(input),
            },
          ],
        },
      ],
    },
  }
}

export function parseResearchPlanResult(
  request: PipelineBatchRequest<ResearchPlanMeta>,
  results: Map<string, unknown>,
  notatSlug: string,
): NotatResearchPlan {
  const succeeded = requireSucceededResult(
    results.get(request.custom_id) as any,
    request.custom_id,
  )
  const parsed = parseJsonFromText<Omit<NotatResearchPlan, 'slug' | 'generatedAt'>>(
    extractText(succeeded),
  )

  return {
    ...parsed,
    slug: notatSlug,
    generatedAt: nowIso(),
  }
}

export { researchPlanMarkdown }
