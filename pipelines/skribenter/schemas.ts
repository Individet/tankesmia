import type { OutputConfig } from '@anthropic-ai/sdk/resources/messages/messages.js'

const textSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    url: { type: 'string' },
    date: { type: 'string' },
    publication: { type: 'string' },
    kind: {
      type: 'string',
      enum: ['bok', 'artikkel', 'kronikk', 'bloggpost', 'rapport', 'akademisk', 'podkast', 'annet'],
    },
  },
  required: ['title', 'kind'],
  additionalProperties: false,
} as const

const linkSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    url: { type: 'string' },
    label: { type: 'string' },
  },
  required: ['type', 'url'],
  additionalProperties: false,
} as const

export const CHANGE_CHECK_OUTPUT_CONFIG: OutputConfig = {
  format: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        newTexts: { type: 'array', items: textSchema },
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              date: { type: 'string' },
              url: { type: 'string' },
              significance: { type: 'string', enum: ['high', 'low'] },
            },
            required: ['description', 'date', 'significance'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string' },
      },
      required: ['newTexts', 'events', 'notes'],
      additionalProperties: false,
    },
  },
}

export const RESEARCH_OUTPUT_CONFIG: OutputConfig = {
  format: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        tagline: { type: 'string' },
        born: { type: ['integer', 'null'] },
        died: { type: ['integer', 'null'] },
        image: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                url: { type: 'string' },
                sourcePage: { type: 'string' },
                credit: { type: 'string' },
                license: { type: 'string' },
              },
              required: ['url'],
              additionalProperties: false,
            },
          ],
        },
        platforms: { type: 'array', items: linkSchema },
        links: { type: 'array', items: linkSchema },
        keyFacts: { type: 'array', items: { type: 'string' } },
        freedomContributions: { type: 'array', items: { type: 'string' } },
        themes: { type: 'array', items: { type: 'string' } },
        texts: { type: 'array', items: textSchema },
      },
      required: [
        'name',
        'tagline',
        'born',
        'died',
        'image',
        'platforms',
        'links',
        'keyFacts',
        'freedomContributions',
        'themes',
        'texts',
      ],
      additionalProperties: false,
    },
  },
}
