import type Anthropic from '@anthropic-ai/sdk'

export interface ActorInput {
  name: string
  type: string
  parti?: string
  tilhørighet?: string
  jurisdiksjon?: string
  periode?: string
  beskrivelse?: string
}

export interface DimensionDefinition {
  id: string
  number: string
  name: string
  philosophicalBasis: string
  description: string
}

export interface SubdimensionDefinition {
  id: string
  number: string
  name: string
  dimensionId: string
  description: string
  searchHints: string[]
}

export interface ActorDossier {
  actorSlug: string
  actor: ActorInput
  searchAliases: string[]
  period: string
  jurisdiction: string
  generatedAt: string
}

export interface ResearchPlanSubdimension {
  subdimensionId: string
  priority: 'high' | 'medium' | 'low'
  rationale: string
  searchQueries: string[]
  negativeQueries: string[]
  stopConditions: string[]
}

export interface ResearchPlan {
  actorSlug: string
  actorName: string
  generatedAt: string
  profileSummary: string
  primarySourcePriorities: string[]
  secondarySourcePriorities: string[]
  sourcePriorityNotes: string[]
  subdimensions: ResearchPlanSubdimension[]
}

export interface CitationRecord {
  url: string
  title: string
  citedText?: string
}

export interface EvidenceFinding {
  claim: string
  stance: 'positive' | 'negative' | 'mixed' | 'unknown'
  evidenceType: 'primary' | 'secondary' | 'mixed' | 'unknown'
  positionType: 'explicit' | 'implicit' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  timePattern: string
  inconsistency: string
  note: string
}

export interface EvidenceArtifact {
  actorSlug: string
  actorName: string
  subdimensionId: string
  subdimensionName: string
  harvestedAt: string
  summary: string
  stance: 'positive' | 'negative' | 'mixed' | 'unknown'
  positionType: 'explicit' | 'implicit' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  dataGap: boolean
  findings: EvidenceFinding[]
  unresolvedQuestions: string[]
  citations: CitationRecord[]
}

export interface ReviewedSubdimensionEvidence {
  subdimensionId: string
  subdimensionName: string
  narrative: string
  acceptedClaims: string[]
  discardedClaims: string[]
  confidence: 'high' | 'medium' | 'low'
  dataGap: boolean
  recommendedFollowUpQueries: string[]
  citations: CitationRecord[]
}

export interface EvidenceMatrix {
  actorSlug: string
  actorName: string
  generatedAt: string
  overallNarrative: string
  crossDimensionNotes: string[]
  subdimensions: ReviewedSubdimensionEvidence[]
}

export interface SubdimensionScoreDraft {
  subdimensionId: string
  subdimensionName: string
  score: number | null
  rationale: string
  confidence: 'high' | 'medium' | 'low'
  conflictingEvidence: boolean
  imputationCandidate?: number | null
  imputationBasis?:
    | 'party-alignment'
    | 'organization-alignment'
    | 'dimension-profile'
    | 'overall-profile'
    | 'none'
  imputationRationale?: string
  estimatedScore?: number | null
}

export interface DimensionScoreSummary {
  dimensionId: string
  dimensionName: string
  observedRawSum: number
  estimatedRawSum: number
  observedCount: number
  dataGapCount: number
}

export interface ScoreDraft {
  actorSlug: string
  actorName: string
  generatedAt: string
  subdimensions: SubdimensionScoreDraft[]
  dimensionSummaries: DimensionScoreSummary[]
  observedCount: number
  estimatedCount: number
  dataGapCount: number
  observedRawSum: number
  estimatedRawSum: number
  observedScore: number
  estimatedScore: number
  confidenceLevel: 'høy' | 'middels' | 'lav'
  keyStrengths: string[]
  keyRisks: string[]
  crossDimensionNotes: string[]
}

export interface GapResearchTarget {
  actorSlug: string
  subdimensionId: string
  queryReasons: string[]
}

export interface GapResearchPlan {
  actorSlug: string
  targets: GapResearchTarget[]
}

export interface PipelinePaths {
  actorDir: string
  dossierJson: string
  researchPlanJson: string
  sourcePriorityMarkdown: string
  evidenceDir: string
  evidenceMatrixJson: string
  evidenceMatrixMarkdown: string
  scoreDraftJson: string
  scoreDraftMarkdown: string
  gapResolutionJson: string
  reportMarkdown: string
}

type SDKBatchRequest = Parameters<
  Anthropic['messages']['batches']['create']
>[0]['requests'][number]

export interface PipelineBatchRequest<TMeta = unknown> extends SDKBatchRequest {
  meta?: TMeta
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

export interface BatchTransport {
  createBatch(requests: PipelineBatchRequest[], label: string): Promise<string>
  waitForBatch(batchId: string, label: string): Promise<void>
  getBatchResults(batchId: string): Promise<Map<string, PipelineBatchResult>>
}

export interface RunPipelineOptions {
  actorFile: string
  outputDir: string
  manifestFile: string
  manifestKortFile: string
  manifestFullFile: string
  frameworkFile: string
  templateFile: string
  dryRun?: boolean
  skipGapResearch?: boolean
  /** Hopp over steg 1–(N-1) og last allerede ferdig-kjørte artefakter fra disk. */
  fromStep?: number
  transport?: BatchTransport
  /** Aktørdata injisert direkte (f.eks. fra miljøvariabler), overstyrer actorFile. */
  envActors?: ActorInput[]
}

export interface RunPipelineSummary {
  outputDir: string
  actorCount: number
  reportsGenerated: number
  gapResearchRequests: number
  prUrl?: string
}
