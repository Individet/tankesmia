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

export const RESEARCH_PLAN_OUTPUT_CONFIG: OutputConfig = {
  format: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        mainQuestion: { type: 'string' },
        context: { type: 'string' },
        freedomPerspective: { type: 'string' },
        comparativeAngles: { type: 'array', items: { type: 'string' } },
        researchAreas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              searchQueries: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'title', 'description', 'searchQueries'],
            additionalProperties: false,
          },
        },
      },
      required: [
        'topic',
        'mainQuestion',
        'context',
        'freedomPerspective',
        'comparativeAngles',
        'researchAreas',
      ],
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
        areaId: { type: 'string' },
        areaTitle: { type: 'string' },
        summary: { type: 'string' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              claim: { type: 'string' },
              relevance: { type: 'string' },
              confidence: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
              },
            },
            required: ['claim', 'relevance', 'confidence'],
            additionalProperties: false,
          },
        },
        citations: { type: 'array', items: citationSchema },
      },
      required: ['areaId', 'areaTitle', 'summary', 'findings', 'citations'],
      additionalProperties: false,
    },
  },
}
