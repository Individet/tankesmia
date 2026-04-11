import { MODELS } from './constants.ts'
import {
  buildFinalReportSystemPrompt,
  buildFinalReportUserPrompt,
} from './prompts.ts'
import type {
  ActorDossier,
  EvidenceMatrix,
  PipelineBatchRequest,
  ScoreDraft,
} from './types.ts'
import { extractText, makeCustomId, requireSucceededResult } from './utils.ts'

interface FinalReportMeta {
  actorSlug: string
}

export function buildFinalReportRequests(
  dossiers: ActorDossier[],
  matrices: Map<string, EvidenceMatrix>,
  scoreDrafts: Map<string, ScoreDraft>,
  framework: string,
  template: string,
): PipelineBatchRequest<FinalReportMeta>[] {
  return dossiers.map((dossier) => {
    const matrix = matrices.get(dossier.actorSlug)
    const scoreDraft = scoreDrafts.get(dossier.actorSlug)

    if (!matrix || !scoreDraft) {
      throw new Error(`Mangler sluttdatagrunnlag for ${dossier.actorSlug}`)
    }

    return {
      custom_id: makeCustomId(dossier.actorSlug, 'report'),
      meta: { actorSlug: dossier.actorSlug },
      params: {
        model: MODELS.finalReport,
        max_tokens: 12000,
        system: buildFinalReportSystemPrompt(framework, template),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildFinalReportUserPrompt(dossier, matrix, scoreDraft),
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
