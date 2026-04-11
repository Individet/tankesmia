import { MODELS, SUBDIMENSIONS } from './constants.ts'
import {
  buildEvidenceHarvestSystemPrompt,
  buildEvidenceHarvestUserPrompt,
  buildResearchTools,
} from './prompts.ts'
import type {
  ActorDossier,
  EvidenceArtifact,
  PipelineBatchRequest,
  ResearchPlan,
} from './types.ts'
import {
  extractText,
  extractUniqueCitations,
  makeCustomId,
  parseJsonFromText,
  requireSucceededResult,
} from './utils.ts'

interface EvidenceHarvestMeta {
  actorSlug: string
  subdimensionId: string
}

export function buildEvidenceHarvestRequests(
  dossiers: ActorDossier[],
  researchPlans: Map<string, ResearchPlan>,
  framework: string,
  manifest: string,
): PipelineBatchRequest<EvidenceHarvestMeta>[] {
  return dossiers.flatMap((dossier) => {
    const plan = researchPlans.get(dossier.actorSlug)
    if (!plan) {
      throw new Error(`Mangler research plan for ${dossier.actorSlug}`)
    }

    return SUBDIMENSIONS.map((subdimension) => ({
      custom_id: makeCustomId(dossier.actorSlug, subdimension.id, 'evidence'),
      meta: {
        actorSlug: dossier.actorSlug,
        subdimensionId: subdimension.id,
      },
      params: {
        model: MODELS.evidenceHarvest,
        max_tokens: 3500,
        system: buildEvidenceHarvestSystemPrompt(framework, manifest),
        tools: buildResearchTools(),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildEvidenceHarvestUserPrompt(dossier, plan, subdimension),
              },
            ],
          },
        ],
      },
    }))
  })
}

export function parseEvidenceHarvestResults(
  requests: PipelineBatchRequest<EvidenceHarvestMeta>[],
  results: Map<string, any>,
): Map<string, EvidenceArtifact> {
  const artifacts = new Map<string, EvidenceArtifact>()

  for (const request of requests) {
    const succeeded = requireSucceededResult(
      results.get(request.custom_id),
      request.custom_id,
    )
    const parsed = parseJsonFromText<EvidenceArtifact>(extractText(succeeded))
    const actorSlug = request.meta?.actorSlug
    const subdimensionId = request.meta?.subdimensionId

    if (!actorSlug || !subdimensionId) {
      throw new Error(`Mangler evidence-meta for ${request.custom_id}`)
    }

    const key = `${actorSlug}:${subdimensionId}`
    artifacts.set(key, {
      ...parsed,
      actorSlug,
      subdimensionId,
      citations: extractUniqueCitations(succeeded),
    })
  }

  return artifacts
}

export function evidenceArtifactMarkdown(artifact: EvidenceArtifact): string {
  return [
    `# ${artifact.subdimensionId} - ${artifact.subdimensionName}`,
    '',
    `- Stance: ${artifact.stance}`,
    `- Position type: ${artifact.positionType}`,
    `- Confidence: ${artifact.confidence}`,
    `- Data gap: ${artifact.dataGap ? 'yes' : 'no'}`,
    '',
    artifact.summary,
    '',
    '## Findings',
    ...artifact.findings.flatMap((finding) => [
      `- Claim: ${finding.claim}`,
      `  - Stance: ${finding.stance}`,
      `  - Evidence: ${finding.evidenceType}`,
      `  - Position: ${finding.positionType}`,
      `  - Confidence: ${finding.confidence}`,
      `  - Pattern: ${finding.timePattern}`,
      `  - Inconsistency: ${finding.inconsistency}`,
      `  - Note: ${finding.note}`,
    ]),
    '',
    '## Citations',
    ...artifact.citations.map(
      (citation) =>
        `- [${citation.title}](${citation.url})${citation.citedText ? ` - "${citation.citedText}"` : ''}`,
    ),
  ].join('\n')
}
