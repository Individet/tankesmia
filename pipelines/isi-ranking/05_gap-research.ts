import { MODELS, SUBDIMENSIONS } from './constants.ts'
import {
  buildGapResearchSystemPrompt,
  buildGapResearchUserPrompt,
  buildResearchTools,
} from './prompts.ts'
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
  parseJsonFromText,
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

    const targets = draft.subdimensions
      .filter(
        (item) => item.score === null || item.confidence === 'low' || item.conflictingEvidence,
      )
      .slice(0, 6)
      .map((item) => ({
        actorSlug: dossier.actorSlug,
        subdimensionId: item.subdimensionId,
        queryReasons: [
          item.score === null ? 'Underdimensjonen mangler score.' : 'Scoren er skjør.',
          item.conflictingEvidence ? 'Det finnes motstridende evidens.' : 'Confidence er lav.',
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
      const subdimension = SUBDIMENSIONS.find((item) => item.id === target.subdimensionId)

      if (!dossier || !subdimension) {
        throw new Error(`Klarte ikke å bygge gap research request for ${target.subdimensionId}`)
      }

      return {
        custom_id: makeCustomId(plan.actorSlug, target.subdimensionId, 'gap'),
        meta: {
          actorSlug: plan.actorSlug,
          subdimensionId: target.subdimensionId,
        },
        params: {
          model: MODELS.gapResearch,
          max_tokens: 2500,
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
                    evidenceArtifacts.get(`${plan.actorSlug}:${target.subdimensionId}`),
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
    const parsed = parseJsonFromText<EvidenceArtifact>(extractText(succeeded))
    const actorSlug = request.meta?.actorSlug
    const subdimensionId = request.meta?.subdimensionId

    if (!actorSlug || !subdimensionId) {
      throw new Error(`Mangler gap research meta for ${request.custom_id}`)
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
      findings: [...existing.findings, ...artifact.findings],
      citations: [...existing.citations, ...artifact.citations],
      unresolvedQuestions: Array.from(
        new Set([...existing.unresolvedQuestions, ...artifact.unresolvedQuestions]),
      ),
    })
  }

  return merged
}
