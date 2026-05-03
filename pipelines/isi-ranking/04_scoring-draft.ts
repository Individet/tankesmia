import { MODELS, SUBDIMENSIONS } from './constants.ts'
import { buildScoringSystemPrompt, buildScoringUserPrompt } from './prompts.ts'
import { SCORE_DRAFT_OUTPUT_CONFIG } from './schemas.ts'
import { finalizeScoreDraft } from './scoring.ts'
import type {
  ActorDossier,
  EvidenceMatrix,
  PipelineBatchRequest,
  ScoreDraft,
} from './types.ts'
import {
  extractText,
  makeCustomId,
  nowIso,
  requireSucceededResult,
} from './utils.ts'

interface ScoringDraftMeta {
  actorSlug: string
}

type PartialScoreDraft = Omit<
  ScoreDraft,
  | 'generatedAt'
  | 'dimensionSummaries'
  | 'observedCount'
  | 'estimatedCount'
  | 'dataGapCount'
  | 'observedRawSum'
  | 'estimatedRawSum'
  | 'observedScore'
  | 'estimatedScore'
  | 'confidenceLevel'
>

export function buildScoringDraftRequests(
  dossiers: ActorDossier[],
  matrices: Map<string, EvidenceMatrix>,
  framework: string,
  manifest: string,
): PipelineBatchRequest<ScoringDraftMeta>[] {
  const dossiersBySlug = new Map(dossiers.map((item) => [item.actorSlug, item]))

  return Array.from(matrices.values()).map((matrix) => {
    const dossier = dossiersBySlug.get(matrix.actorSlug)
    if (!dossier) {
      throw new Error(
        `Mangler dossier for aktør '${matrix.actorSlug}' i scoringssteget. Tilgjengelige slugs: ${[...dossiersBySlug.keys()].join(', ')}`,
      )
    }

    return {
      custom_id: makeCustomId(matrix.actorSlug, 'scoring'),
      meta: { actorSlug: matrix.actorSlug },
      params: {
        model: MODELS.scoringDraft,
        max_tokens: 16000,
        output_config: SCORE_DRAFT_OUTPUT_CONFIG,
        system: buildScoringSystemPrompt(framework, manifest),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildScoringUserPrompt(dossier, matrix),
              },
            ],
          },
        ],
      },
    }
  })
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
    const partial = JSON.parse(extractText(succeeded)) as PartialScoreDraft
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
    `- Observed score: ${draft.observedScore}`,
    `- Estimated score: ${draft.estimatedScore}`,
    `- Observed raw sum: ${draft.observedRawSum}`,
    `- Estimated raw sum: ${draft.estimatedRawSum}`,
    `- Observed count: ${draft.observedCount}`,
    `- Estimated count: ${draft.estimatedCount}`,
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
    ...draft.subdimensions.map((item) => {
      const observed = item.score === null ? 'null' : item.score
      const estimated =
        item.estimatedScore === null ? 'null' : item.estimatedScore
      const imputation =
        item.score === null
          ? ` | imputed=${estimated} via ${item.imputationBasis ?? 'none'}`
          : ''
      return `- ${item.subdimensionId}: observed=${observed}, estimated=${estimated} (${item.confidence}) - ${item.rationale}${imputation}`
    }),
  ].join('\n')
}
