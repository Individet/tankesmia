import { MODELS } from './constants.ts'
import { buildResearchPlanSystemPrompt, buildResearchPlanUserPrompt, buildResearchTools } from './prompts.ts'
import type { ActorDossier, PipelineBatchRequest, ResearchPlan } from './types.ts'
import { extractText, makeCustomId, parseJsonFromText, requireSucceededResult } from './utils.ts'

interface ResearchPlanRequestMeta {
  actorSlug: string
}

export function buildResearchPlanRequests(
  dossiers: ActorDossier[],
  framework: string,
): PipelineBatchRequest<ResearchPlanRequestMeta>[] {
  return dossiers.map((dossier) => ({
    custom_id: makeCustomId(dossier.actorSlug, 'plan'),
    meta: { actorSlug: dossier.actorSlug },
    params: {
      model: MODELS.researchPlan,
      max_tokens: 5000,
      system: buildResearchPlanSystemPrompt(framework),
      tools: buildResearchTools(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildResearchPlanUserPrompt(dossier),
            },
          ],
        },
      ],
    },
  }))
}

export function parseResearchPlanResults(
  requests: PipelineBatchRequest<ResearchPlanRequestMeta>[],
  results: Map<string, ReturnType<typeof requireSucceededResult> extends never ? never : any>,
): Map<string, ResearchPlan> {
  const plans = new Map<string, ResearchPlan>()

  for (const request of requests) {
    const succeeded = requireSucceededResult(
      results.get(request.custom_id),
      request.custom_id,
    )
    const parsed = parseJsonFromText<ResearchPlan>(extractText(succeeded))
    const actorSlug = request.meta?.actorSlug
    if (!actorSlug) {
      throw new Error(`Mangler actorSlug-meta for ${request.custom_id}`)
    }

    plans.set(actorSlug, {
      ...parsed,
      actorSlug,
    })
  }

  return plans
}

export function researchPlanMarkdown(plan: ResearchPlan): string {
  return [
    `# Research priority: ${plan.actorName}`,
    '',
    `> ${plan.profileSummary}`,
    '',
    '## Primary source priorities',
    ...plan.primarySourcePriorities.map((item) => `- ${item}`),
    '',
    '## Secondary source priorities',
    ...plan.secondarySourcePriorities.map((item) => `- ${item}`),
    '',
    '## Notes',
    ...plan.sourcePriorityNotes.map((item) => `- ${item}`),
    '',
    '## Subdimensions',
    ...plan.subdimensions.flatMap((item) => [
      `### ${item.subdimensionId}`,
      `- Priority: ${item.priority}`,
      `- Rationale: ${item.rationale}`,
      `- Search queries: ${item.searchQueries.join(' | ')}`,
      `- Negative queries: ${item.negativeQueries.join(' | ')}`,
      `- Preferred domains: ${item.preferredDomains.join(' | ')}`,
      `- Stop conditions: ${item.stopConditions.join(' | ')}`,
      '',
    ]),
  ].join('\n')
}
