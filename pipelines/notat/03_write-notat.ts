import { MODELS } from './constants.ts'
import {
  buildWriterSystemPrompt,
  buildWriterUserPrompt,
} from './prompts.ts'
import type {
  NotatEvidenceArtifact,
  NotatInput,
  NotatResearchPlan,
  PipelineBatchRequest,
} from './types.ts'
import { extractText, makeCustomId, requireSucceededResult } from './utils.ts'

interface WriteNotatMeta {
  notatSlug: string
}

export function buildWriteNotatRequest(
  input: NotatInput,
  plan: NotatResearchPlan,
  evidenceArtifacts: NotatEvidenceArtifact[],
  notatSlug: string,
  manifest: string,
  formatGuide: string,
): PipelineBatchRequest<WriteNotatMeta> {
  return {
    custom_id: makeCustomId(notatSlug, 'write-notat'),
    meta: { notatSlug },
    params: {
      model: MODELS.writeNotat,
      max_tokens: 32000,
      system: buildWriterSystemPrompt(manifest, formatGuide),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildWriterUserPrompt(input, plan, evidenceArtifacts),
            },
          ],
        },
      ],
    },
  }
}

export function parseWriteNotatResult(
  request: PipelineBatchRequest<WriteNotatMeta>,
  results: Map<string, unknown>,
): string {
  const succeeded = requireSucceededResult(
    results.get(request.custom_id) as any,
    request.custom_id,
  )
  return extractText(succeeded)
}
