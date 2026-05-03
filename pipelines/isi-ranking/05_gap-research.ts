import { MODELS, SUBDIMENSIONS } from './constants.ts'
import {
  buildGapResearchSystemPrompt,
  buildGapResearchUserPrompt,
  buildResearchTools,
} from './prompts.ts'
import { EVIDENCE_ARTIFACT_OUTPUT_CONFIG } from './schemas.ts'
import type {
  ActorDossier,
  EvidenceArtifact,
  GapResearchPlan,
  PipelineBatchRequest,
  ScoreDraft,
} from './types.ts'
import {
  extractText,
  extractUniqueCitations,
  makeCustomId,
  requireSucceededResult,
} from './utils.ts'

interface GapResearchMeta {
  actorSlug: string
  subdimensionId: string
}

export function buildGapResearchPlans(
  dossiers: ActorDossier[],
  scoreDrafts: Map<string, ScoreDraft>,
): GapResearchPlan[] {
  return dossiers.map((dossier) => {
    const draft = scoreDrafts.get(dossier.actorSlug)
    if (!draft) {
      return { actorSlug: dossier.actorSlug, targets: [] }
    }

    const gapPriority = (
      item: (typeof draft.subdimensions)[number],
    ): number => {
      if (item.score === null) return 0
      if (item.conflictingEvidence) return 1
      return 2
    }

    const targets = draft.subdimensions
      .filter((item) => item.score === null || item.conflictingEvidence)
      .sort((a, b) => gapPriority(a) - gapPriority(b))
      .slice(0, 6)
      .map((item) => ({
        actorSlug: dossier.actorSlug,
        subdimensionId: item.subdimensionId,
        queryReasons: [
          item.score === null
            ? 'Underdimensjonen mangler score.'
            : 'Scoren er skjør.',
          item.conflictingEvidence
            ? 'Det finnes motstridende evidens.'
            : 'Confidence er lav.',
          item.rationale,
        ],
      }))

    return {
      actorSlug: dossier.actorSlug,
      targets,
    }
  })
}

export function buildGapResearchRequests(
  dossiers: ActorDossier[],
  plans: GapResearchPlan[],
  framework: string,
  manifest: string,
  evidenceArtifacts: Map<string, EvidenceArtifact>,
): PipelineBatchRequest<GapResearchMeta>[] {
  const dossiersBySlug = new Map(dossiers.map((item) => [item.actorSlug, item]))

  return plans.flatMap((plan) =>
    plan.targets.map((target) => {
      const dossier = dossiersBySlug.get(plan.actorSlug)
      const subdimension = SUBDIMENSIONS.find(
        (item) => item.id === target.subdimensionId,
      )

      if (!dossier || !subdimension) {
        throw new Error(
          `Klarte ikke å bygge gap research request for ${target.subdimensionId}`,
        )
      }

      return {
        custom_id: makeCustomId(plan.actorSlug, target.subdimensionId, 'gap'),
        meta: {
          actorSlug: plan.actorSlug,
          subdimensionId: target.subdimensionId,
        },
        params: {
          model: MODELS.gapResearch,
          max_tokens: 12000,
          output_config: EVIDENCE_ARTIFACT_OUTPUT_CONFIG,
          system: buildGapResearchSystemPrompt(framework, manifest),
          tools: buildResearchTools(),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: buildGapResearchUserPrompt(
                    dossier,
                    subdimension,
                    target.queryReasons,
                    evidenceArtifacts.get(
                      `${plan.actorSlug}:${target.subdimensionId}`,
                    ),
                  ),
                },
              ],
            },
          ],
        },
      }
    }),
  )
}

export function parseGapResearchResults(
  requests: PipelineBatchRequest<GapResearchMeta>[],
  results: Map<string, any>,
): Map<string, EvidenceArtifact> {
  const artifacts = new Map<string, EvidenceArtifact>()

  for (const request of requests) {
    const succeeded = requireSucceededResult(
      results.get(request.custom_id),
      request.custom_id,
    )
    const actorSlug = request.meta?.actorSlug
    const subdimensionId = request.meta?.subdimensionId

    if (!actorSlug || !subdimensionId) {
      throw new Error(`Mangler gap research meta for ${request.custom_id}`)
    }

    const rawText = extractText(succeeded)
    if (!rawText.trim()) {
      // Model finished after web searches without producing a JSON output block.
      // Skip — the existing base artifact from step 2 is retained during merge.
      console.warn(
        `[gap] ${request.custom_id}: ingen tekstblokk i svaret — gap-artifact hoppes over.`,
      )
      continue
    }

    const parsed = JSON.parse(rawText) as EvidenceArtifact

    if (!Array.isArray(parsed.findings)) {
      // Model returned a stub without findings (gave up after search).
      // Skip — the existing base artifact from step 2 is retained during merge.
      console.warn(
        `[gap] ${request.custom_id}: findings mangler i svaret — gap-artifact hoppes over.`,
      )
      continue
    }

    artifacts.set(`${actorSlug}:${subdimensionId}`, {
      ...parsed,
      actorSlug,
      subdimensionId,
      citations: extractUniqueCitations(succeeded),
    })
  }

  return artifacts
}

export function mergeEvidenceArtifacts(
  baseArtifacts: Map<string, EvidenceArtifact>,
  gapArtifacts: Map<string, EvidenceArtifact>,
): Map<string, EvidenceArtifact> {
  const merged = new Map(baseArtifacts)

  for (const [key, artifact] of gapArtifacts.entries()) {
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, artifact)
      continue
    }

    merged.set(key, {
      ...artifact,
      findings: [
        ...(Array.isArray(existing.findings) ? existing.findings : []),
        ...(Array.isArray(artifact.findings) ? artifact.findings : []),
      ],
      citations: [
        ...(Array.isArray(existing.citations) ? existing.citations : []),
        ...(Array.isArray(artifact.citations) ? artifact.citations : []),
      ],
      unresolvedQuestions: Array.from(
        new Set([
          ...(Array.isArray(existing.unresolvedQuestions) ? existing.unresolvedQuestions : []),
          ...(Array.isArray(artifact.unresolvedQuestions) ? artifact.unresolvedQuestions : []),
        ]),
      ),
    })
  }

  return merged
}
