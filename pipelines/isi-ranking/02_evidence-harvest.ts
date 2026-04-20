import { MODELS, SUBDIMENSIONS } from './constants.ts'
import {
  buildEvidenceHarvestSystemPrompt,
  buildEvidenceHarvestUserPrompt,
  buildResearchTools,
} from './prompts.ts'
import { EVIDENCE_ARTIFACT_OUTPUT_CONFIG } from './schemas.ts'
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
  nowIso,
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
        max_tokens: 8000,
        output_config: EVIDENCE_ARTIFACT_OUTPUT_CONFIG,
        system: buildEvidenceHarvestSystemPrompt(framework, manifest),
        tools: buildResearchTools(),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildEvidenceHarvestUserPrompt(
                  dossier,
                  plan,
                  subdimension,
                ),
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
    const text = extractText(succeeded)
    const actorSlug = request.meta?.actorSlug
    const subdimensionId = request.meta?.subdimensionId

    if (!actorSlug || !subdimensionId) {
      throw new Error(`Mangler evidence-meta for ${request.custom_id}`)
    }

    const key = `${actorSlug}:${subdimensionId}`

    if (!text.trim()) {
      // Modellen avsluttet uten tekst-blokk (f.eks. etter tool_use uten funn).
      // Opprett syntetisk dataGap-artifact — fanges opp av trinn 5 gap-research.
      const subdimension = SUBDIMENSIONS.find((s) => s.id === subdimensionId)
      const blockTypes = succeeded.content.map((b: any) => b.type).join(', ')
      console.warn(
        `[${request.custom_id}] Ingen tekst-blokk i svar (blokker: [${blockTypes}]). ` +
          `Oppretter syntetisk dataGap-artifact.`,
      )
      artifacts.set(key, {
        actorSlug,
        actorName: actorSlug,
        subdimensionId,
        subdimensionName: subdimension?.name ?? subdimensionId,
        harvestedAt: new Date().toISOString().slice(0, 10),
        summary:
          'Modellen produserte ingen tekst-blokk etter websøk. Automatisk markert som datagap.',
        stance: 'unknown',
        positionType: 'unknown',
        confidence: 'low',
        dataGap: true,
        findings: [],
        unresolvedQuestions: [],
        citations: [],
      })
      continue
    }

    const parsed = JSON.parse(text) as EvidenceArtifact

    artifacts.set(key, {
      ...parsed,
      actorSlug,
      subdimensionId,
      harvestedAt: nowIso(),
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
