import matter from 'gray-matter'
import { MODELS } from './constants.ts'
import {
  buildFinalReportSystemPrompt,
  buildFinalReportUserPrompt,
} from './prompts.ts'
import type {
  ActorDossier,
  EvidenceArtifact,
  EvidenceMatrix,
  PipelineBatchRequest,
  ScoreDraft,
} from './types.ts'
import { extractText, makeCustomId, nowIso, requireSucceededResult } from './utils.ts'

interface FinalReportMeta {
  actorSlug: string
}

function inferActorCountry(jurisdiction: string): string {
  if (jurisdiction.toLowerCase() === 'norge') {
    return 'NO'
  }

  return jurisdiction
}

function buildAffiliation(dossier: ActorDossier): string {
  return [dossier.actor.parti, dossier.actor.tilhørighet].filter(Boolean).join(' / ')
}

function buildScoresRecord(
  scoreDraft: ScoreDraft,
  field: 'score' | 'estimatedScore',
): Record<string, number | null> {
  return Object.fromEntries(
    scoreDraft.subdimensions.map((item) => [item.subdimensionId, item[field] ?? null]),
  )
}

function buildSourceLists(evidenceArtifacts: EvidenceArtifact[]) {
  const sources = new Map<
    string,
    {
      title: string
      url: string
      sourceType: 'primary' | 'secondary'
    }
  >()

  for (const artifact of evidenceArtifacts) {
    const hasPrimaryFinding = artifact.findings.some(
      (finding) => finding.evidenceType === 'primary',
    )

    for (const citation of artifact.citations) {
      const key = `${citation.url}::${citation.title}`
      const sourceType = hasPrimaryFinding ? 'primary' : 'secondary'
      const existing = sources.get(key)

      if (!existing || (existing.sourceType === 'secondary' && sourceType === 'primary')) {
        sources.set(key, {
          title: citation.title,
          url: citation.url,
          sourceType,
        })
      }
    }
  }

  const primarySources = Array.from(sources.values())
    .filter((item) => item.sourceType === 'primary')
    .map(({ title, url }) => ({ title, url }))
  const secondarySources = Array.from(sources.values())
    .filter((item) => item.sourceType === 'secondary')
    .map(({ title, url }) => ({ title, url }))

  return { primarySources, secondarySources }
}

function buildImputations(scoreDraft: ScoreDraft) {
  return scoreDraft.subdimensions
    .filter(
      (item) =>
        item.score === null &&
        item.estimatedScore !== null &&
        item.imputationBasis &&
        item.imputationBasis !== 'none',
    )
    .map((item) => ({
      subdimension: item.subdimensionId,
      estimatedScore: item.estimatedScore,
      basis: item.imputationBasis,
      rationale: item.imputationRationale ?? '',
    }))
}

export function buildPrefilledTemplate(
  template: string,
  dossier: ActorDossier,
  scoreDraft: ScoreDraft,
  evidenceArtifacts: EvidenceArtifact[],
): string {
  const parsed = matter(template)
  const timestamp = nowIso()
  const { primarySources, secondarySources } = buildSourceLists(evidenceArtifacts)
  const imputations = buildImputations(scoreDraft)

  const frontmatter = {
    ...parsed.data,
    created: timestamp,
    lastUpdated: timestamp,
    author: MODELS.finalReport,
    actorId: dossier.actorSlug,
    actorName: dossier.actor.name,
    actorSlug: dossier.actorSlug,
    actorType: dossier.actor.type,
    actorCountry: inferActorCountry(dossier.jurisdiction),
    actorAffiliation: buildAffiliation(dossier),
    analysisScope: dossier.period,
    observedScore: scoreDraft.observedScore,
    estimatedScore: scoreDraft.estimatedScore,
    primarySources,
    secondarySources,
    confidenceLevel: scoreDraft.confidenceLevel,
    dataGaps: scoreDraft.subdimensions
      .filter((item) => item.score === null)
      .map((item) => item.subdimensionId),
    scores: {
      observed: buildScoresRecord(scoreDraft, 'score'),
      estimated: buildScoresRecord(scoreDraft, 'estimatedScore'),
    },
    imputations,
  }

  return matter.stringify(parsed.content, frontmatter)
}

export function buildFinalReportRequests(
  dossiers: ActorDossier[],
  matrices: Map<string, EvidenceMatrix>,
  scoreDrafts: Map<string, ScoreDraft>,
  evidenceArtifacts: Map<string, EvidenceArtifact>,
  framework: string,
  manifest: string,
  template: string,
): PipelineBatchRequest<FinalReportMeta>[] {
  return dossiers.map((dossier) => {
    const matrix = matrices.get(dossier.actorSlug)
    const scoreDraft = scoreDrafts.get(dossier.actorSlug)
    const actorEvidenceArtifacts = Array.from(evidenceArtifacts.values()).filter(
      (artifact) => artifact.actorSlug === dossier.actorSlug,
    )

    if (!matrix || !scoreDraft) {
      throw new Error(`Mangler sluttdatagrunnlag for ${dossier.actorSlug}`)
    }

    const prefilledTemplate = buildPrefilledTemplate(
      template,
      dossier,
      scoreDraft,
      actorEvidenceArtifacts,
    )

    return {
      custom_id: makeCustomId(dossier.actorSlug, 'report'),
      meta: { actorSlug: dossier.actorSlug },
      params: {
        model: MODELS.finalReport,
        max_tokens: 20000,
        system: buildFinalReportSystemPrompt(framework, manifest),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildFinalReportUserPrompt(
                  dossier,
                  matrix,
                  scoreDraft,
                  prefilledTemplate,
                ),
              },
            ],
          },
        ],
      },
    }
  })
}

export function parseFinalReportResults(
  requests: PipelineBatchRequest<FinalReportMeta>[],
  results: Map<string, any>,
): Map<string, string> {
  const reports = new Map<string, string>()

  for (const request of requests) {
    const succeeded = requireSucceededResult(
      results.get(request.custom_id),
      request.custom_id,
    )
    const actorSlug = request.meta?.actorSlug
    if (!actorSlug) {
      throw new Error(`Mangler actorSlug-meta for ${request.custom_id}`)
    }

    let text = extractText(succeeded).trim()
    if (text.startsWith('```markdown')) {
      text = text.replace(/^```markdown\s*/i, '').replace(/\s*```$/i, '')
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/i, '').replace(/\s*```$/i, '')
    }

    reports.set(actorSlug, text)
  }

  return reports
}
