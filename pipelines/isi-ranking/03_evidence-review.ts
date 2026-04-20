import { MODELS } from './constants.ts'
import {
  buildEvidenceReviewSystemPrompt,
  buildEvidenceReviewUserPrompt,
} from './prompts.ts'
import { EVIDENCE_MATRIX_OUTPUT_CONFIG } from './schemas.ts'
import type {
  ActorDossier,
  EvidenceArtifact,
  EvidenceMatrix,
  PipelineBatchRequest,
} from './types.ts'
import { extractText, makeCustomId, nowIso, requireSucceededResult } from './utils.ts'

interface EvidenceReviewMeta {
  actorSlug: string
}

export function buildEvidenceReviewRequests(
  dossiers: ActorDossier[],
  evidenceArtifacts: Map<string, EvidenceArtifact>,
  framework: string,
  manifest: string,
): PipelineBatchRequest<EvidenceReviewMeta>[] {
  return dossiers.map((dossier) => {
    const actorEvidence = Array.from(evidenceArtifacts.values()).filter(
      (artifact) => artifact.actorSlug === dossier.actorSlug,
    )

    return {
      custom_id: makeCustomId(dossier.actorSlug, 'matrix'),
      meta: { actorSlug: dossier.actorSlug },
      params: {
        model: MODELS.evidenceReview,
        max_tokens: 30000,
        output_config: EVIDENCE_MATRIX_OUTPUT_CONFIG,
        system: buildEvidenceReviewSystemPrompt(framework, manifest),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildEvidenceReviewUserPrompt(
                  dossier.actor.name,
                  actorEvidence,
                ),
              },
            ],
          },
        ],
      },
    }
  })
}

export function parseEvidenceReviewResults(
  requests: PipelineBatchRequest<EvidenceReviewMeta>[],
  results: Map<string, any>,
): Map<string, EvidenceMatrix> {
  const matrices = new Map<string, EvidenceMatrix>()

  for (const request of requests) {
    const succeeded = requireSucceededResult(
      results.get(request.custom_id),
      request.custom_id,
    )
    const parsed = JSON.parse(extractText(succeeded)) as EvidenceMatrix
    const actorSlug = request.meta?.actorSlug
    if (!actorSlug) {
      throw new Error(`Mangler actorSlug-meta for ${request.custom_id}`)
    }

    matrices.set(actorSlug, {
      ...parsed,
      actorSlug,
      generatedAt: nowIso(),
    })
  }

  return matrices
}

export function evidenceMatrixMarkdown(matrix: EvidenceMatrix): string {
  return [
    `# Evidence matrix: ${matrix.actorName}`,
    '',
    matrix.overallNarrative,
    '',
    '## Cross-dimension notes',
    ...matrix.crossDimensionNotes.map((item) => `- ${item}`),
    '',
    '## Subdimensions',
    ...matrix.subdimensions.flatMap((item) => [
      `### ${item.subdimensionId} - ${item.subdimensionName}`,
      item.narrative,
      '',
      `- Confidence: ${item.confidence}`,
      `- Data gap: ${item.dataGap ? 'yes' : 'no'}`,
      `- Accepted claims: ${item.acceptedClaims.join(' | ')}`,
      `- Discarded claims: ${item.discardedClaims.join(' | ')}`,
      `- Follow-up queries: ${item.recommendedFollowUpQueries.join(' | ')}`,
      ...item.citations.map(
        (citation) =>
          `- Citation: [${citation.title}](${citation.url})${citation.citedText ? ` - "${citation.citedText}"` : ''}`,
      ),
      '',
    ]),
  ].join('\n')
}
