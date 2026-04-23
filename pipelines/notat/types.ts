import type Anthropic from '@anthropic-ai/sdk'

export interface NotatInput {
  tema: string
  beskrivelse: string
  year?: number
  number?: string
}

export interface NotatResearchArea {
  id: string
  title: string
  description: string
  searchQueries: string[]
}

export interface NotatResearchPlan {
  topic: string
  slug: string
  generatedAt: string
  mainQuestion: string
  context: string
  freedomPerspective: string
  comparativeAngles: string[]
  researchAreas: NotatResearchArea[]
}

export interface NotatEvidenceFinding {
  claim: string
  relevance: string
  confidence: 'high' | 'medium' | 'low'
}

export interface CitationRecord {
  url: string
  title: string
  citedText?: string
}

export interface NotatEvidenceArtifact {
  areaId: string
  areaTitle: string
  harvestedAt: string
  summary: string
  findings: NotatEvidenceFinding[]
  citations: CitationRecord[]
}

export interface BatchUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  webSearchRequests: number
}

export interface BatchTextBlock {
  type: 'text'
  text: string
  citations?: CitationRecord[]
}

export interface BatchOtherBlock {
  type: string
  [key: string]: unknown
}

export interface BatchSucceededResult {
  type: 'succeeded'
  model?: string
  /** 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' */
  stopReason?: string | null
  usage: BatchUsage
  content: Array<BatchTextBlock | BatchOtherBlock>
}

export interface BatchErroredResult {
  type: 'errored' | 'expired' | 'canceled'
  error?: unknown
}

export type PipelineBatchResult = BatchSucceededResult | BatchErroredResult

type SDKBatchRequest = Parameters<
  Anthropic['messages']['batches']['create']
>[0]['requests'][number]

export interface PipelineBatchRequest<TMeta = unknown> extends SDKBatchRequest {
  meta?: TMeta
}

export interface BatchTransport {
  createBatch(requests: PipelineBatchRequest[], label: string): Promise<string>
  waitForBatch(batchId: string, label: string): Promise<void>
  getBatchResults(batchId: string): Promise<Map<string, PipelineBatchResult>>
}

export interface RunNotatPipelineOptions {
  inputFile: string
  outputDir: string
  manifestFile: string
  manifestKortFile: string
  manifestFullFile: string
  formatFile: string
  /** Inline input supplied via env vars — overrides inputFile when set. */
  envInput?: NotatInput
  dryRun?: boolean
  fromStep?: number
  transport?: BatchTransport
}

export interface RunNotatPipelineSummary {
  outputDir: string
  notatSlug: string
  stepsCompleted: number
  prUrl?: string
}
