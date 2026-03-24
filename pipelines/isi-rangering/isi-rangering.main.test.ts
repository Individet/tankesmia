import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function logMockCall(name: string, payload: unknown): void {
  console.log(`[MOCK] ${name}`)
  console.log(JSON.stringify(payload, null, 2))
}

const mockState = vi.hoisted(() => {
  const anthropicBatchRequests = new Map<string, Array<{ custom_id: string }>>()
  let anthropicBatchCounter = 0
  let prCounter = 0

  return {
    anthropicBatchRequests,
    getNextBatchId() {
      anthropicBatchCounter += 1
      return `batch-${anthropicBatchCounter}`
    },
    resetBatchCounter() {
      anthropicBatchCounter = 0
    },
    getNextPrUrl() {
      prCounter += 1
      return `https://example.test/pr/${prCounter}`
    },
    resetPrCounter() {
      prCounter = 0
    },
    anthropicConstructorCalls: [] as Array<Record<string, unknown>>,
    octokitConstructorCalls: [] as Array<Record<string, unknown>>,
  }
})

const anthropicCreate = vi.fn(async ({ requests }: { requests: Array<{ custom_id: string }> }) => {
  logMockCall('anthropic.messages.batches.create', { requests })
  const batchId = mockState.getNextBatchId()
  mockState.anthropicBatchRequests.set(batchId, requests)
  logMockCall('anthropic.messages.batches.create:result', { id: batchId })
  return { id: batchId }
})

const anthropicRetrieve = vi.fn(async (batchId: string) => {
  logMockCall('anthropic.messages.batches.retrieve', { batchId })
  const result = {
    processing_status: 'ended',
    request_counts: {
      succeeded: 1,
      errored: 0,
    },
  }
  logMockCall('anthropic.messages.batches.retrieve:result', result)
  return result
})

const anthropicResults = vi.fn(async (batchId: string) => {
  logMockCall('anthropic.messages.batches.results', { batchId })
  const requests = mockState.anthropicBatchRequests.get(batchId) ?? []

  async function* iterator() {
    for (const request of requests) {
      const customId = request.custom_id
      const text = customId.endsWith('-lang-rapport')
        ? '# Lang rapport\n\nInnhold.'
        : customId.endsWith('-oppsummering')
          ? '# Oppsummering\n\nInnhold.'
          : `Funn for ${customId}`

      const result = {
        custom_id: customId,
        result: {
          type: 'succeeded',
          message: {
            content: [{ type: 'text', text }],
            usage: {
              input_tokens: 11,
              output_tokens: 22,
            },
          },
        },
      }

      logMockCall('anthropic.messages.batches.results:yield', result)
      yield result
    }
  }

  return iterator()
})

const octokitGetBranch = vi.fn(async (args: Record<string, unknown>) => {
  logMockCall('octokit.repos.getBranch', args)
  const result = { data: { commit: { sha: 'base-sha' } } }
  logMockCall('octokit.repos.getBranch:result', result)
  return result
})

const octokitGetContent = vi.fn(async (args: Record<string, unknown>) => {
  logMockCall('octokit.repos.getContent', args)
  throw new Error('not found')
})

const octokitCreateOrUpdateFileContents = vi.fn(
  async (args: Record<string, unknown>) => {
    logMockCall('octokit.repos.createOrUpdateFileContents', args)
    const result = {}
    logMockCall('octokit.repos.createOrUpdateFileContents:result', result)
    return result
  },
)

const octokitCreateRef = vi.fn(async (args: Record<string, unknown>) => {
  logMockCall('octokit.git.createRef', args)
  const result = {}
  logMockCall('octokit.git.createRef:result', result)
  return result
})

const octokitCreatePull = vi.fn(async (args: Record<string, unknown>) => {
  logMockCall('octokit.pulls.create', args)
  const result = {
    data: {
      html_url: mockState.getNextPrUrl(),
    },
  }
  logMockCall('octokit.pulls.create:result', result)
  return result
})

vi.mock('@anthropic-ai/sdk', () => {
  class AnthropicMock {
    messages = {
      batches: {
        create: anthropicCreate,
        retrieve: anthropicRetrieve,
        results: anthropicResults,
      },
    }

    constructor(options: Record<string, unknown>) {
      logMockCall('new Anthropic()', options)
      mockState.anthropicConstructorCalls.push(options)
    }
  }

  return { default: AnthropicMock }
})

vi.mock('@octokit/rest', () => {
  class OctokitMock {
    repos = {
      getBranch: octokitGetBranch,
      getContent: octokitGetContent,
      createOrUpdateFileContents: octokitCreateOrUpdateFileContents,
    }

    git = {
      createRef: octokitCreateRef,
    }

    pulls = {
      create: octokitCreatePull,
    }

    constructor(options: Record<string, unknown>) {
      logMockCall('new Octokit()', options)
      mockState.octokitConstructorCalls.push(options)
    }
  }

  return { Octokit: OctokitMock }
})

describe('isi-rangering main', () => {
  let tempDir = ''

  beforeEach(() => {
    vi.resetModules()

    mockState.anthropicBatchRequests.clear()
    mockState.resetBatchCounter()
    mockState.resetPrCounter()
    mockState.anthropicConstructorCalls.length = 0
    mockState.octokitConstructorCalls.length = 0

    anthropicCreate.mockClear()
    anthropicRetrieve.mockClear()
    anthropicResults.mockClear()
    octokitGetBranch.mockClear()
    octokitGetContent.mockClear()
    octokitCreateOrUpdateFileContents.mockClear()
    octokitCreateRef.mockClear()
    octokitCreatePull.mockClear()

    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.GITHUB_TOKEN = 'test-token'

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isi-main-test-'))
  })

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('runs main with mocked Anthropic and Octokit clients', async () => {
    const actorsPath = path.join(tempDir, 'actors.json')
    fs.writeFileSync(
      actorsPath,
      JSON.stringify([{ name: 'Test Person', type: 'politiker' }]),
      'utf8',
    )

    const { main } = await import('./isi-rangering')
    await main(actorsPath)

    expect(mockState.anthropicConstructorCalls).toHaveLength(1)
    expect(mockState.octokitConstructorCalls).toHaveLength(1)

    expect(anthropicCreate).toHaveBeenCalledTimes(2)
    expect(anthropicRetrieve).toHaveBeenCalledTimes(2)
    expect(anthropicResults).toHaveBeenCalledTimes(2)

    const firstBatchRequests = anthropicCreate.mock.calls[0]?.[0]?.requests
    const secondBatchRequests = anthropicCreate.mock.calls[1]?.[0]?.requests

    expect(firstBatchRequests).toHaveLength(6)
    expect(secondBatchRequests).toHaveLength(2)

    expect(octokitGetBranch).toHaveBeenCalledTimes(2)
    expect(octokitCreateRef).toHaveBeenCalledTimes(2)
    expect(octokitCreateOrUpdateFileContents).toHaveBeenCalledTimes(3)
    expect(octokitCreatePull).toHaveBeenCalledTimes(2)

    const committedPaths = octokitCreateOrUpdateFileContents.mock.calls.map(
      ([args]) => args.path,
    )

    expect(committedPaths).toEqual(
      expect.arrayContaining([
        'raw-data/test-person/research.json',
        'src/content/aktorer/test-person/rapport.md',
        'src/content/aktorer/test-person/oversikt.md',
      ]),
    )
  })
})
