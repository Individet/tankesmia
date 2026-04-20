import type { OutputConfig } from '@anthropic-ai/sdk/resources/messages/messages.js'

const citationSchema = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    title: { type: 'string' },
    citedText: { type: 'string' },
  },
  required: ['url', 'title'],
  additionalProperties: false,
} as const

const evidenceFindingSchema = {
  type: 'object',
  properties: {
    claim: { type: 'string' },
    stance: { type: 'string', enum: ['positive', 'negative', 'mixed', 'unknown'] },
    evidenceType: { type: 'string', enum: ['primary', 'secondary', 'mixed', 'unknown'] },
    positionType: { type: 'string', enum: ['explicit', 'implicit', 'unknown'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    timePattern: { type: 'string' },
    inconsistency: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['claim', 'stance', 'evidenceType', 'positionType', 'confidence', 'timePattern', 'inconsistency', 'note'],
  additionalProperties: false,
} as const

export const RESEARCH_PLAN_OUTPUT_CONFIG: OutputConfig = {
  format: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        actorSlug: { type: 'string' },
        actorName: { type: 'string' },
        profileSummary: { type: 'string' },
        primarySourcePriorities: { type: 'array', items: { type: 'string' } },
        secondarySourcePriorities: { type: 'array', items: { type: 'string' } },
        sourcePriorityNotes: { type: 'array', items: { type: 'string' } },
        subdimensions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              subdimensionId: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              rationale: { type: 'string' },
              searchQueries: { type: 'array', items: { type: 'string' } },
              negativeQueries: { type: 'array', items: { type: 'string' } },
              stopConditions: { type: 'array', items: { type: 'string' } },
            },
            required: ['subdimensionId', 'priority', 'rationale', 'searchQueries', 'negativeQueries', 'stopConditions'],
            additionalProperties: false,
          },
        },
      },
      required: ['actorSlug', 'actorName', 'profileSummary', 'primarySourcePriorities', 'secondarySourcePriorities', 'sourcePriorityNotes', 'subdimensions'],
      additionalProperties: false,
    },
  },
}

export const EVIDENCE_ARTIFACT_OUTPUT_CONFIG: OutputConfig = {
  format: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        actorSlug: { type: 'string' },
        actorName: { type: 'string' },
        subdimensionId: { type: 'string' },
        subdimensionName: { type: 'string' },
        summary: { type: 'string' },
        stance: { type: 'string', enum: ['positive', 'negative', 'mixed', 'unknown'] },
        positionType: { type: 'string', enum: ['explicit', 'implicit', 'unknown'] },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        dataGap: { type: 'boolean' },
        findings: { type: 'array', items: evidenceFindingSchema },
        unresolvedQuestions: { type: 'array', items: { type: 'string' } },
        citations: { type: 'array', items: citationSchema },
      },
      required: ['actorSlug', 'actorName', 'subdimensionId', 'subdimensionName', 'summary', 'stance', 'positionType', 'confidence', 'dataGap', 'findings', 'unresolvedQuestions', 'citations'],
      additionalProperties: false,
    },
  },
}

export const EVIDENCE_MATRIX_OUTPUT_CONFIG: OutputConfig = {
  format: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        actorSlug: { type: 'string' },
        actorName: { type: 'string' },
        overallNarrative: { type: 'string' },
        crossDimensionNotes: { type: 'array', items: { type: 'string' } },
        subdimensions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              subdimensionId: { type: 'string' },
              subdimensionName: { type: 'string' },
              narrative: { type: 'string' },
              acceptedClaims: { type: 'array', items: { type: 'string' } },
              discardedClaims: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              dataGap: { type: 'boolean' },
              recommendedFollowUpQueries: { type: 'array', items: { type: 'string' } },
              citations: { type: 'array', items: citationSchema },
            },
            required: ['subdimensionId', 'subdimensionName', 'narrative', 'acceptedClaims', 'discardedClaims', 'confidence', 'dataGap', 'recommendedFollowUpQueries', 'citations'],
            additionalProperties: false,
          },
        },
      },
      required: ['actorSlug', 'actorName', 'overallNarrative', 'crossDimensionNotes', 'subdimensions'],
      additionalProperties: false,
    },
  },
}

export const SCORE_DRAFT_OUTPUT_CONFIG: OutputConfig = {
  format: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        actorSlug: { type: 'string' },
        actorName: { type: 'string' },
        subdimensions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              subdimensionId: { type: 'string' },
              subdimensionName: { type: 'string' },
              score: { type: ['number', 'null'] },
              rationale: { type: 'string' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              conflictingEvidence: { type: 'boolean' },
              imputationCandidate: { type: ['number', 'null'] },
              imputationBasis: { type: 'string', enum: ['party-alignment', 'organization-alignment', 'dimension-profile', 'overall-profile', 'none'] },
              imputationRationale: { type: 'string' },
              estimatedScore: { type: ['number', 'null'] },
            },
            required: ['subdimensionId', 'subdimensionName', 'score', 'rationale', 'confidence', 'conflictingEvidence'],
            additionalProperties: false,
          },
        },
        keyStrengths: { type: 'array', items: { type: 'string' } },
        keyRisks: { type: 'array', items: { type: 'string' } },
        crossDimensionNotes: { type: 'array', items: { type: 'string' } },
      },
      required: ['actorSlug', 'actorName', 'subdimensions', 'keyStrengths', 'keyRisks', 'crossDimensionNotes'],
      additionalProperties: false,
    },
  },
}
