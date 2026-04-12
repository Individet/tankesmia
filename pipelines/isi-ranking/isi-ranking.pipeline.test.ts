import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SUBDIMENSIONS } from './constants.ts'
import { runIsiRankingPipeline } from './pipeline.ts'
import type {
  BatchTransport,
  PipelineBatchRequest,
  PipelineBatchResult,
} from './types.ts'

class MockBatchTransport implements BatchTransport {
  public readonly batches = new Map<string, PipelineBatchRequest[]>()
  public readonly labels = new Map<string, string>()
  public readonly createCalls: Array<{ batchId: string; label: string; requests: PipelineBatchRequest[] }> =
    []
  private batchCounter = 0

  async createBatch(
    requests: PipelineBatchRequest[],
    label: string,
  ): Promise<string> {
    this.batchCounter += 1
    const batchId = `batch-${this.batchCounter}`
    this.batches.set(batchId, requests)
    this.labels.set(batchId, label)
    this.createCalls.push({ batchId, label, requests })
    return batchId
  }

  async waitForBatch(): Promise<void> {}

  async getBatchResults(batchId: string): Promise<Map<string, PipelineBatchResult>> {
    const label = this.labels.get(batchId)
    const requests = this.batches.get(batchId) ?? []
    const results = new Map<string, PipelineBatchResult>()

    for (const request of requests) {
      results.set(request.custom_id, this.buildResult(label, request))
    }

    return results
  }

  private buildResult(
    label: string | undefined,
    request: PipelineBatchRequest,
  ): PipelineBatchResult {
    switch (label) {
      case 'isi-ranking-research-plan':
        return this.succeeded(
          JSON.stringify({
            actorSlug: 'test-person',
            actorName: 'Test Person',
            generatedAt: '2026-04-11T00:00:00.000Z',
            profileSummary: 'Bred offentlig profil med mange kilder.',
            primarySourcePriorities: ['stortinget.no', 'partiprogram'],
            secondarySourcePriorities: ['NRK', 'Aftenposten'],
            sourcePriorityNotes: ['Prioriter dokumenterte uttalelser.'],
            subdimensions: SUBDIMENSIONS.map((item) => ({
              subdimensionId: item.id,
              priority: 'medium',
              rationale: `Plan for ${item.id}`,
              searchQueries: [`${item.name} Test Person`],
              negativeQueries: ['irrelevant'],
              stopConditions: ['To primaerkilder eller ett eksplisitt vedtak.'],
            })),
          }),
        )

      case 'isi-ranking-evidence':
        return this.succeeded(
          JSON.stringify({
            actorSlug: 'test-person',
            actorName: 'Test Person',
            subdimensionId: request.meta?.subdimensionId,
            subdimensionName: SUBDIMENSIONS.find(
              (item) => item.id === request.meta?.subdimensionId,
            )?.name,
            harvestedAt: '2026-04-11T00:00:00.000Z',
            summary: `Evidence summary for ${request.meta?.subdimensionId}`,
            stance: request.meta?.subdimensionId === 'd6_4' ? 'unknown' : 'positive',
            positionType: request.meta?.subdimensionId === 'd6_4' ? 'unknown' : 'explicit',
            confidence: request.meta?.subdimensionId === 'd6_4' ? 'low' : 'high',
            dataGap: request.meta?.subdimensionId === 'd6_4',
            unresolvedQuestions:
              request.meta?.subdimensionId === 'd6_4' ? ['Need better source'] : [],
            findings: [
              {
                claim: `Claim for ${request.meta?.subdimensionId}`,
                stance: request.meta?.subdimensionId === 'd6_4' ? 'unknown' : 'positive',
                evidenceType: request.meta?.subdimensionId === 'd6_4' ? 'unknown' : 'primary',
                positionType:
                  request.meta?.subdimensionId === 'd6_4' ? 'unknown' : 'explicit',
                confidence: request.meta?.subdimensionId === 'd6_4' ? 'low' : 'high',
                timePattern: 'consistent',
                inconsistency: '',
                note: 'Mock evidence',
              },
            ],
          }),
          [
            {
              url: `https://example.test/${request.meta?.subdimensionId}`,
              title: `Source ${request.meta?.subdimensionId}`,
              citedText: 'Mock citation',
            },
          ],
        )

      case 'isi-ranking-matrix':
      case 'isi-ranking-matrix-refresh':
        return this.succeeded(
          JSON.stringify({
            actorSlug: 'test-person',
            actorName: 'Test Person',
            generatedAt: '2026-04-11T00:00:00.000Z',
            overallNarrative: 'Samlet narrativ.',
            crossDimensionNotes: ['Noen inkonsistenser.'],
            subdimensions: SUBDIMENSIONS.map((item) => ({
              subdimensionId: item.id,
              subdimensionName: item.name,
              narrative: `Narrative for ${item.id}`,
              acceptedClaims: [`Accepted ${item.id}`],
              discardedClaims: [],
              confidence:
                label === 'isi-ranking-matrix' && item.id === 'd6_4' ? 'low' : 'high',
              dataGap: label === 'isi-ranking-matrix' && item.id === 'd6_4',
              recommendedFollowUpQueries:
                item.id === 'd6_4' ? ['Need follow-up query'] : [],
              citations: [
                {
                  url: `https://example.test/${item.id}`,
                  title: `Citation ${item.id}`,
                  citedText: 'Mock citation',
                },
              ],
            })),
          }),
        )

      case 'isi-ranking-scoring':
        return this.succeeded(
          JSON.stringify({
            actorSlug: 'test-person',
            actorName: 'Test Person',
            subdimensions: SUBDIMENSIONS.map((item) => ({
              subdimensionId: item.id,
              subdimensionName: item.name,
              score: item.id === 'd6_4' ? null : 1,
              rationale: `Scoring rationale for ${item.id}`,
              confidence: item.id === 'd6_4' ? 'low' : 'high',
              conflictingEvidence: item.id === 'd6_4',
              imputationCandidate: item.id === 'd6_4' ? 1 : null,
              imputationBasis: item.id === 'd6_4' ? 'party-alignment' : 'none',
              imputationRationale:
                item.id === 'd6_4' ? 'Actor aligns with party line on data autonomy.' : '',
            })),
            keyStrengths: ['Consistent civil-liberty profile'],
            keyRisks: ['Thin data on d6_4'],
            crossDimensionNotes: ['Mock note'],
          }),
        )

      case 'isi-ranking-gap':
        return this.succeeded(
          JSON.stringify({
            actorSlug: 'test-person',
            actorName: 'Test Person',
            subdimensionId: 'd6_4',
            subdimensionName: 'Eierskap til egne data',
            harvestedAt: '2026-04-11T00:00:00.000Z',
            summary: 'Gap research resolved d6_4.',
            stance: 'positive',
            positionType: 'explicit',
            confidence: 'high',
            dataGap: false,
            unresolvedQuestions: [],
            findings: [
              {
                claim: 'Resolved claim',
                stance: 'positive',
                evidenceType: 'primary',
                positionType: 'explicit',
                confidence: 'high',
                timePattern: 'consistent',
                inconsistency: '',
                note: 'Resolved',
              },
            ],
          }),
          [
            {
              url: 'https://example.test/d6_4-gap',
              title: 'Gap source',
              citedText: 'Gap citation',
            },
          ],
        )

      case 'isi-ranking-scoring-refresh':
        return this.succeeded(
          JSON.stringify({
            actorSlug: 'test-person',
            actorName: 'Test Person',
            subdimensions: SUBDIMENSIONS.map((item) => ({
              subdimensionId: item.id,
              subdimensionName: item.name,
              score: item.id === 'd6_4' ? 1 : 1,
              rationale: `Final scoring rationale for ${item.id}`,
              confidence: 'high',
              conflictingEvidence: false,
            })),
            keyStrengths: ['Consistent civil-liberty profile'],
            keyRisks: ['No major unresolved gaps'],
            crossDimensionNotes: ['Gap resolved'],
          }),
        )

      case 'isi-ranking-final-report':
        return this.succeeded(
          [
            '---',
            'actorName: "Test Person"',
            'isiScore: 75',
            '---',
            '',
            '# Test Person',
            '',
            'Endelig rapport.',
          ].join('\n'),
        )

      default:
        throw new Error(`Ukjent batch label i test: ${label}`)
    }
  }

  private succeeded(text: string, citations?: Array<{ url: string; title: string; citedText?: string }>): PipelineBatchResult {
    return {
      type: 'succeeded',
      model: 'mock-model',
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        webSearchRequests: 0,
      },
      content: [
        {
          type: 'text',
          text,
          citations,
        },
      ],
    }
  }
}

describe('isi-ranking pipeline', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'isi-ranking-test-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('runs end-to-end with mocked Anthropic batches and writes pipeline artifacts', async () => {
    const actorsPath = path.join(tempDir, 'actors.json')
    const manifestPath = path.join(tempDir, 'manifest.md')
    const manifestKortPath = path.join(tempDir, 'manifest-kort.md')
    const manifestFullPath = path.join(tempDir, 'manifest-full.md')
    const frameworkPath = path.join(tempDir, 'framework.md')
    const templatePath = path.join(tempDir, 'template.md')
    const outputDir = path.join(tempDir, 'output')

    await fs.writeFile(
      actorsPath,
      JSON.stringify([
        {
          name: 'Test Person',
          type: 'person',
          periode: 'Siste 3-5 ar',
          jurisdiksjon: 'Norge',
          parti: 'Frihetspartiet',
        },
      ]),
      'utf8',
    )
    await fs.writeFile(manifestPath, '# Manifest', 'utf8')
    await fs.writeFile(manifestKortPath, '# Kort manifest', 'utf8')
    await fs.writeFile(manifestFullPath, '# Fullt manifest', 'utf8')
    await fs.writeFile(frameworkPath, '# Framework', 'utf8')
    await fs.writeFile(
      templatePath,
      ['---', 'actorName: ""', 'observedScore: 0', 'estimatedScore: 0', '---', '', '# Template']
        .join('\n'),
      'utf8',
    )

    const transport = new MockBatchTransport()

    const summary = await runIsiRankingPipeline({
      actorFile: actorsPath,
      outputDir,
      manifestFile: manifestPath,
      manifestKortFile: manifestKortPath,
      manifestFullFile: manifestFullPath,
      frameworkFile: frameworkPath,
      templateFile: templatePath,
      transport,
    })

    expect(summary.actorCount).toBe(1)
    expect(summary.reportsGenerated).toBe(1)
    expect(summary.gapResearchRequests).toBe(1)

    const actorDir = path.join(outputDir, 'test-person')
    const evidenceDir = path.join(actorDir, 'evidence')
    const scoreDraftPath = path.join(actorDir, 'score-draft.json')
    const reportPath = path.join(actorDir, 'rapport.md')

    const scoreDraft = JSON.parse(await fs.readFile(scoreDraftPath, 'utf8'))
    expect(scoreDraft.observedScore).toBe(75)
    expect(scoreDraft.estimatedScore).toBe(75)
    expect(
      scoreDraft.subdimensions.find((item: any) => item.subdimensionId === 'd6_4')
        ?.estimatedScore,
    ).toBe(1)
    expect(await fs.readFile(reportPath, 'utf8')).toContain('Endelig rapport.')

    const evidenceFiles = await fs.readdir(evidenceDir)
    expect(evidenceFiles.filter((file) => file.endsWith('.json'))).toHaveLength(24)

    const finalReportCall = transport.createCalls.find(
      (call) => call.label === 'isi-ranking-final-report',
    )
    const firstMessage = finalReportCall?.requests?.[0]?.params?.messages?.[0]
    const firstBlock = Array.isArray(firstMessage?.content)
      ? firstMessage?.content?.[0]
      : undefined
    const finalReportPrompt =
      firstBlock && typeof firstBlock === 'object' && 'text' in firstBlock
        ? String(firstBlock.text)
        : ''

    expect(finalReportPrompt).toContain('"observedScore": 75')
    expect(finalReportPrompt).toContain('"estimatedScore": 75')
    expect(finalReportPrompt).toContain('actorName: Test Person')
    expect(finalReportPrompt).toContain('actorSlug: test-person')
    expect(finalReportPrompt).toContain('primarySources:')
    expect(finalReportPrompt).toContain('https://example.test/d1_1')
  })
})
