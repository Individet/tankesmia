import { MODELS } from './constants.ts'
import {
  buildEvidenceHarvestSystemPrompt,
  buildEvidenceHarvestUserPrompt,
  buildResearchTools,
  evidenceArtifactMarkdown,
} from './prompts.ts'
import { EVIDENCE_ARTIFACT_OUTPUT_CONFIG } from './schemas.ts'
import type {
  NotatEvidenceArtifact,
  NotatResearchPlan,
  PipelineBatchRequest,
} from './types.ts'
import {
  extractText,
  extractUniqueCitations,
  makeCustomId,
  nowIso,
  parseJsonFromText,
  requireSucceededResult,
} from './utils.ts'

interface EvidenceHarvestMeta {
  areaId: string
  areaTitle: string
}

export function buildEvidenceHarvestRequests(
  plan: NotatResearchPlan,
  manifest: string,
): PipelineBatchRequest<EvidenceHarvestMeta>[] {
  const researchContext = `${plan.mainQuestion}\n\n${plan.context}`

  return plan.researchAreas.map((area) => ({
    custom_id: makeCustomId(plan.slug, 'evidence', area.id),
    meta: { areaId: area.id, areaTitle: area.title },
    params: {
      model: MODELS.evidenceHarvest,
      max_tokens: 8000,
      output_config: EVIDENCE_ARTIFACT_OUTPUT_CONFIG,
      system: buildEvidenceHarvestSystemPrompt(manifest),
      tools: buildResearchTools(6),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildEvidenceHarvestUserPrompt(area, researchContext),
            },
          ],
        },
      ],
    },
  }))
}

export function parseEvidenceHarvestResults(
  requests: PipelineBatchRequest<EvidenceHarvestMeta>[],
  results: Map<string, unknown>,
): Map<string, NotatEvidenceArtifact> {
  const artifacts = new Map<string, NotatEvidenceArtifact>()

  for (const request of requests) {
    const areaId = request.meta?.areaId
    if (!areaId) {
      throw new Error(`Mangler areaId-meta for ${request.custom_id}`)
    }

    const succeeded = requireSucceededResult(
      results.get(request.custom_id) as any,
      request.custom_id,
    )

    const parsed = parseJsonFromText<
      Omit<NotatEvidenceArtifact, 'harvestedAt' | 'citations'>
    >(extractText(succeeded))

    const citations = extractUniqueCitations(succeeded)

    artifacts.set(areaId, {
      ...parsed,
      harvestedAt: nowIso(),
      citations,
    })
  }

  return artifacts
}

export { evidenceArtifactMarkdown }
