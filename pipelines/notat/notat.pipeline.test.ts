import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runNotatPipeline } from './pipeline.ts'
import type {
  BatchTransport,
  NotatResearchPlan,
  PipelineBatchRequest,
  PipelineBatchResult,
} from './types.ts'

const MOCK_RESEARCH_AREAS = [
  {
    id: 'area-01',
    title: 'Skoletvang og hjemmeundervisning',
    description: 'Norges restriktive holdning til hjemmeundervisning.',
    searchQueries: ['hjemmeundervisning Norge lov', 'homeschooling Norway'],
  },
  {
    id: 'area-02',
    title: 'Karaktersetting og konkurranse',
    description: 'Debatten om karakterer i grunnskolen.',
    searchQueries: ['karakterer grunnskolen Norge', 'grades primary school Norway'],
  },
  {
    id: 'area-03',
    title: 'Fellesskapsverdier i læreplan',
    description: 'Kollektive vs. individuelle verdier i Kunnskapsløftet.',
    searchQueries: ['Kunnskapsløftet individ fellesskap', 'Norwegian curriculum individual'],
  },
]

class MockBatchTransport implements BatchTransport {
  public readonly batches = new Map<string, PipelineBatchRequest[]>()
  public readonly labels = new Map<string, string>()
  public readonly createCalls: Array<{
    batchId: string
    label: string
    requests: PipelineBatchRequest[]
  }> = []
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

  async getBatchResults(
    batchId: string,
  ): Promise<Map<string, PipelineBatchResult>> {
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
      case 'notat-research-plan': {
        const plan: Omit<NotatResearchPlan, 'slug' | 'generatedAt'> = {
          topic: 'Demoniseringen av individet på grunnskolen',
          mainQuestion:
            'Hvordan undergraver norsk grunnskole individuell autonomi?',
          context:
            'Norsk skole er styrt av Kunnskapsløftet som vektlegger fellesskapsverdier.',
          freedomPerspective:
            'Berører d1 (kroppslig autonomi) og d5 (foreningsfrihet).',
          comparativeAngles: ['Finland', 'Sverige', 'USA'],
          researchAreas: MOCK_RESEARCH_AREAS,
        }
        return this.succeeded(JSON.stringify(plan))
      }

      case 'notat-evidence': {
        const areaId = request.meta?.areaId as string
        const areaTitle = request.meta?.areaTitle as string
        return this.succeeded(
          JSON.stringify({
            areaId,
            areaTitle,
            summary: `Funn om ${areaTitle} i norsk grunnskole.`,
            findings: [
              {
                claim: `Konkret funn om ${areaId}`,
                relevance: 'Relevant for frihetsperspektivet.',
                confidence: 'high',
              },
            ],
            citations: [],
          }),
          [
            {
              url: `https://example.test/${areaId}`,
              title: `Kilde for ${areaId}`,
              citedText: 'Mock sitat',
            },
          ],
        )
      }

      case 'notat-write':
        return this.succeeded(
          [
            '---',
            'title: "Demoniseringen av individet på grunnskolen"',
            'subtitle: "Hvordan norsk skole undergraver individuell autonomi"',
            'date: 2026-04-21',
            'slug: demoniseringen-av-individet-pa-grunnskolen',
            'type: notat',
            'year: 2026',
            'number: "06"',
            'description: "Norsk grunnskole systematisk undergraver individuell autonomi."',
            'tags: [skole, utdanning, autonomi]',
            'author: "Claude Opus 4.6"',
            'sources: []',
            '---',
            '',
            '# Demoniseringen av individet på grunnskolen',
            '',
            'Dette er det ferdige notatet.',
          ].join('\n'),
        )

      default:
        throw new Error(`Ukjent batch label i test: ${label}`)
    }
  }

  private succeeded(
    text: string,
    citations?: Array<{ url: string; title: string; citedText?: string }>,
  ): PipelineBatchResult {
    return {
      type: 'succeeded',
      model: 'mock-model',
      usage: {
        inputTokens: 10,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        webSearchRequests: 3,
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

describe('notat pipeline', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'notat-test-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('runs end-to-end with mocked Anthropic batches and writes pipeline artifacts', async () => {
    const inputPath = path.join(tempDir, 'notat-input.json')
    const manifestPath = path.join(tempDir, 'manifest.md')
    const manifestKortPath = path.join(tempDir, 'manifest-kort.md')
    const manifestFullPath = path.join(tempDir, 'manifest-full.md')
    const formatPath = path.join(tempDir, 'forfatter-og-format.md')
    const outputDir = path.join(tempDir, 'output')

    await fs.writeFile(
      inputPath,
      JSON.stringify({
        tema: 'Demoniseringen av individet på grunnskolen',
        beskrivelse: 'Norsk grunnskole undergraver individuell autonomi.',
        year: 2026,
        number: '06',
      }),
      'utf8',
    )
    await fs.writeFile(manifestPath, '# Manifest kondensert', 'utf8')
    await fs.writeFile(manifestKortPath, '# Manifest kort', 'utf8')
    await fs.writeFile(manifestFullPath, '# Manifest fullt', 'utf8')
    await fs.writeFile(formatPath, '# Format guide', 'utf8')

    const transport = new MockBatchTransport()

    const summary = await runNotatPipeline({
      inputFile: inputPath,
      outputDir,
      manifestFile: manifestPath,
      manifestKortFile: manifestKortPath,
      manifestFullFile: manifestFullPath,
      formatFile: formatPath,
      transport,
    })

    // Pipeline summary
    expect(summary.notatSlug).toBe('demoniseringen-av-individet-pa-grunnskolen')
    expect(summary.stepsCompleted).toBe(3)
    expect(summary.outputDir).toBe(outputDir)

    // Output directory structure
    const notatDir = path.join(outputDir, summary.notatSlug)
    const evidenceDir = path.join(notatDir, 'evidence')

    // Input copy
    const inputCopy = JSON.parse(
      await fs.readFile(path.join(notatDir, 'notat-input.json'), 'utf8'),
    )
    expect(inputCopy.tema).toBe('Demoniseringen av individet på grunnskolen')

    // Research plan
    const researchPlan = JSON.parse(
      await fs.readFile(path.join(notatDir, 'research-plan.json'), 'utf8'),
    )
    expect(researchPlan.slug).toBe(summary.notatSlug)
    expect(researchPlan.researchAreas).toHaveLength(MOCK_RESEARCH_AREAS.length)
    expect(researchPlan.researchAreas[0].id).toBe('area-01')

    // Research plan markdown
    const planMarkdown = await fs.readFile(
      path.join(notatDir, 'research-plan.md'),
      'utf8',
    )
    expect(planMarkdown).toContain('Demoniseringen av individet på grunnskolen')
    expect(planMarkdown).toContain('area-01')

    // Evidence files — one JSON and one MD per research area
    const evidenceFiles = await fs.readdir(evidenceDir)
    expect(evidenceFiles.filter((f) => f.endsWith('.json'))).toHaveLength(
      MOCK_RESEARCH_AREAS.length,
    )
    expect(evidenceFiles.filter((f) => f.endsWith('.md'))).toHaveLength(
      MOCK_RESEARCH_AREAS.length,
    )

    const evidenceArtifact = JSON.parse(
      await fs.readFile(path.join(evidenceDir, 'area-01.json'), 'utf8'),
    )
    expect(evidenceArtifact.areaId).toBe('area-01')
    expect(evidenceArtifact.citations).toHaveLength(1)
    expect(evidenceArtifact.citations[0].url).toBe(
      'https://example.test/area-01',
    )

    // Final notat
    const notat = await fs.readFile(path.join(notatDir, 'notat.md'), 'utf8')
    expect(notat).toContain('Dette er det ferdige notatet.')
    expect(notat).toContain('type: notat')
    expect(notat).toContain('author: "Claude Opus 4.6"')

    // Verify batch call order
    const batchLabels = transport.createCalls.map((c) => c.label)
    expect(batchLabels[0]).toBe('notat-research-plan')
    expect(batchLabels[1]).toBe('notat-evidence')
    expect(batchLabels[2]).toBe('notat-write')

    // Verify evidence batch had one request per research area
    const evidenceBatch = transport.createCalls.find(
      (c) => c.label === 'notat-evidence',
    )
    expect(evidenceBatch?.requests).toHaveLength(MOCK_RESEARCH_AREAS.length)
    expect(
      evidenceBatch?.requests.map((r) => r.meta?.areaId),
    ).toEqual(MOCK_RESEARCH_AREAS.map((a) => a.id))

    // Verify writer received the research plan and evidence
    const writerCall = transport.createCalls.find(
      (c) => c.label === 'notat-write',
    )
    expect(writerCall?.requests).toHaveLength(1)
    const writerMessage = writerCall?.requests?.[0]?.params?.messages?.[0]
    const writerContent = Array.isArray(writerMessage?.content)
      ? writerMessage?.content?.[0]
      : undefined
    const writerPrompt =
      writerContent && typeof writerContent === 'object' && 'text' in writerContent
        ? String(writerContent.text)
        : ''

    expect(writerPrompt).toContain('Demoniseringen av individet på grunnskolen')
    expect(writerPrompt).toContain('area-01')
    expect(writerPrompt).toContain('Notat 06 2026')
  })

  it('dry-run writes request payload without calling transport', async () => {
    const inputPath = path.join(tempDir, 'notat-input.json')
    const manifestPath = path.join(tempDir, 'manifest.md')
    const manifestKortPath = path.join(tempDir, 'manifest-kort.md')
    const manifestFullPath = path.join(tempDir, 'manifest-full.md')
    const formatPath = path.join(tempDir, 'forfatter-og-format.md')
    const outputDir = path.join(tempDir, 'output')

    await fs.writeFile(
      inputPath,
      JSON.stringify({
        tema: 'Test tema',
        beskrivelse: 'Test beskrivelse',
      }),
      'utf8',
    )
    await fs.writeFile(manifestPath, '# Manifest', 'utf8')
    await fs.writeFile(manifestKortPath, '# Manifest kort', 'utf8')
    await fs.writeFile(manifestFullPath, '# Manifest fullt', 'utf8')
    await fs.writeFile(formatPath, '# Format', 'utf8')

    const summary = await runNotatPipeline({
      inputFile: inputPath,
      outputDir,
      manifestFile: manifestPath,
      manifestKortFile: manifestKortPath,
      manifestFullFile: manifestFullPath,
      formatFile: formatPath,
      dryRun: true,
    })

    expect(summary.notatSlug).toBe('test-tema')
    expect(summary.stepsCompleted).toBe(0)

    const notatDir = path.join(outputDir, summary.notatSlug)
    const requestsFile = path.join(notatDir, '01_research-plan.requests.json')
    const requests = JSON.parse(await fs.readFile(requestsFile, 'utf8'))
    expect(requests).toHaveLength(1)
    expect(requests[0].custom_id).toContain('test-tema')
  })

  it('fromStep=3 loads research plan and evidence from disk and only runs writer', async () => {
    const inputPath = path.join(tempDir, 'notat-input.json')
    const manifestPath = path.join(tempDir, 'manifest.md')
    const manifestKortPath = path.join(tempDir, 'manifest-kort.md')
    const manifestFullPath = path.join(tempDir, 'manifest-full.md')
    const formatPath = path.join(tempDir, 'forfatter-og-format.md')
    const outputDir = path.join(tempDir, 'output')

    await fs.writeFile(
      inputPath,
      JSON.stringify({
        tema: 'Demoniseringen av individet på grunnskolen',
        beskrivelse: 'Test beskrivelse',
        year: 2026,
        number: '06',
      }),
      'utf8',
    )
    await fs.writeFile(manifestPath, '# Manifest', 'utf8')
    await fs.writeFile(manifestKortPath, '# Manifest kort', 'utf8')
    await fs.writeFile(manifestFullPath, '# Manifest fullt', 'utf8')
    await fs.writeFile(formatPath, '# Format', 'utf8')

    // Pre-write research plan and evidence to disk
    const notatSlug = 'demoniseringen-av-individet-pa-grunnskolen'
    const notatDir = path.join(outputDir, notatSlug)
    const evidenceDir = path.join(notatDir, 'evidence')

    await fs.mkdir(evidenceDir, { recursive: true })

    const researchPlan: NotatResearchPlan = {
      topic: 'Demoniseringen av individet på grunnskolen',
      slug: notatSlug,
      generatedAt: '2026-04-21T00:00:00.000Z',
      mainQuestion: 'Hvordan undergraver norsk grunnskole individuell autonomi?',
      context: 'Kontekst fra disk.',
      freedomPerspective: 'Frihetsperspektiv fra disk.',
      comparativeAngles: ['Finland'],
      researchAreas: MOCK_RESEARCH_AREAS,
    }
    await fs.writeFile(
      path.join(notatDir, 'research-plan.json'),
      JSON.stringify(researchPlan),
      'utf8',
    )

    for (const area of MOCK_RESEARCH_AREAS) {
      await fs.writeFile(
        path.join(evidenceDir, `${area.id}.json`),
        JSON.stringify({
          areaId: area.id,
          areaTitle: area.title,
          harvestedAt: '2026-04-21T00:00:00.000Z',
          summary: `Oppsummering fra disk for ${area.id}`,
          findings: [],
          citations: [],
        }),
        'utf8',
      )
    }

    const transport = new MockBatchTransport()

    const summary = await runNotatPipeline({
      inputFile: inputPath,
      outputDir,
      manifestFile: manifestPath,
      manifestKortFile: manifestKortPath,
      manifestFullFile: manifestFullPath,
      formatFile: formatPath,
      transport,
      fromStep: 3,
    })

    expect(summary.stepsCompleted).toBe(3)

    // Only the writer batch should have been called
    const batchLabels = transport.createCalls.map((c) => c.label)
    expect(batchLabels).toEqual(['notat-write'])

    // Notat should have been written
    const notat = await fs.readFile(path.join(notatDir, 'notat.md'), 'utf8')
    expect(notat).toContain('Dette er det ferdige notatet.')
  })
})
