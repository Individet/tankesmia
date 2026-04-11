import { MODELS, SUBDIMENSIONS } from './constants.ts'
import { buildScoringSystemPrompt, buildScoringUserPrompt } from './prompts.ts'
import { finalizeScoreDraft } from './scoring.ts'
import type {
  EvidenceMatrix,
  PipelineBatchRequest,
  ScoreDraft,
} from './types.ts'
import {
  extractText,
  makeCustomId,
  nowIso,
  parseJsonFromText,
  requireSucceededResult,
} from './utils.ts'

interface ScoringDraftMeta {
  actorSlug: string
}

type PartialScoreDraft = Omit<
  ScoreDraft,
  | 'generatedAt'
  | 'dimensionSummaries'
  | 'evaluatedCount'
  | 'dataGapCount'
  | 'rawSum'
  | 'normalizedScore'
  | 'confidenceLevel'
>

export function buildScoringDraftRequests(
  matrices: Map<string, EvidenceMatrix>,
): PipelineBatchRequest<ScoringDraftMeta>[] {
  return Array.from(matrices.values()).map((matrix) => ({
    custom_id: makeCustomId(matrix.actorSlug, 'scoring'),
    meta: { actorSlug: matrix.actorSlug },
    params: {
      model: MODELS.scoringDraft,
      max_tokens: 4500,
      system: buildScoringSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildScoringUserPrompt(matrix),
            },
          ],
        },
      ],
    },
  }))
}

export function parseScoringDraftResults(
  requests: PipelineBatchRequest<ScoringDraftMeta>[],
  results: Map<string, any>,
): Map<string, ScoreDraft> {
  const drafts = new Map<string, ScoreDraft>()

  for (const request of requests) {
    const succeeded = requireSucceededResult(
      results.get(request.custom_id),
      request.custom_id,
    )
    const partial = parseJsonFromText<PartialScoreDraft>(extractText(succeeded))
    const actorSlug = request.meta?.actorSlug
    if (!actorSlug) {
      throw new Error(`Mangler actorSlug-meta for ${request.custom_id}`)
    }

    const normalized = finalizeScoreDraft(
      {
        ...partial,
        actorSlug,
        subdimensions: SUBDIMENSIONS.map((definition) => {
          const existing = partial.subdimensions.find(
            (item) => item.subdimensionId === definition.id,
          )
          if (!existing) {
            return {
              subdimensionId: definition.id,
              subdimensionName: definition.name,
              score: null,
              rationale: 'Ingen eksplisitt score mottatt fra scoringssteget.',
              confidence: 'low' as const,
              conflictingEvidence: false,
            }
          }

          return {
            ...existing,
            subdimensionName: existing.subdimensionName || definition.name,
          }
        }),
      },
      nowIso(),
    )

    drafts.set(actorSlug, normalized)
  }

  return drafts
}

export function scoreDraftMarkdown(draft: ScoreDraft): string {
  return [
    `# Score draft: ${draft.actorName}`,
    '',
    `- Normalized score: ${draft.normalizedScore}`,
    `- Raw sum: ${draft.rawSum}`,
    `- Evaluated count: ${draft.evaluatedCount}`,
    `- Data gap count: ${draft.dataGapCount}`,
    `- Confidence level: ${draft.confidenceLevel}`,
    '',
    '## Key strengths',
    ...draft.keyStrengths.map((item) => `- ${item}`),
    '',
    '## Key risks',
    ...draft.keyRisks.map((item) => `- ${item}`),
    '',
    '## Cross-dimension notes',
    ...draft.crossDimensionNotes.map((item) => `- ${item}`),
    '',
    '## Subdimensions',
    ...draft.subdimensions.map(
      (item) =>
        `- ${item.subdimensionId}: ${item.score === null ? 'null' : item.score} (${item.confidence}) - ${item.rationale}`,
    ),
  ].join('\n')
}
