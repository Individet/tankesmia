import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dropStaleFindings, resolveDecision, triageWriter } from './decide.ts'
import { parseFeed } from './feeds.ts'
import { runSkribenterPipeline, validateRegistry } from './pipeline.ts'
import { renderTextList } from './render.ts'
import { LocalWriterStore } from './store.ts'
import { mergeTexts, normalizeUrl, registryHash } from './texts.ts'
import type {
  BatchTransport,
  ChangeCheckResult,
  FetchLike,
  PipelineBatchRequest,
  PipelineBatchResult,
  PublishedFile,
  Publisher,
  WriterRegistryEntry,
} from './types.ts'

const WRITERS: WriterRegistryEntry[] = [
  {
    id: 'ola-frihet',
    name: 'Ola Frihet',
    description: 'Filosof',
    feeds: ['https://ola.example/feed'],
    links: [{ type: 'substack', url: 'https://ola.substack.com/' }],
  },
  { id: 'kari-marked', name: 'Kari Marked', description: 'Økonom' },
]

type CheckReply = Omit<ChangeCheckResult, 'writerId' | 'checkedAt'>

class MockTransport implements BatchTransport {
  public readonly calls: Array<{ label: string; requests: PipelineBatchRequest[] }> = []
  public checkReplies = new Map<string, CheckReply>()
  /** Overstyr enkeltresultater, f.eks. for å simulere feil: `${label}:${writerId}`. */
  public overrides = new Map<string, PipelineBatchResult>()
  public researchPatch = new Map<string, Record<string, unknown>>()
  private batches = new Map<string, { label: string; requests: PipelineBatchRequest[] }>()

  async createBatch(requests: PipelineBatchRequest[], label: string) {
    const id = `batch-${this.batches.size + 1}`
    this.batches.set(id, { label, requests })
    this.calls.push({ label, requests })
    return id
  }

  async waitForBatch() {}

  async getBatchResults(batchId: string) {
    const { label, requests } = this.batches.get(batchId)!
    const results = new Map<string, PipelineBatchResult>()
    for (const request of requests) {
      const writerId = (request.meta as { writerId: string }).writerId
      const override = this.overrides.get(`${label}:${writerId}`)
      results.set(request.custom_id, override ?? succeeded(this.reply(label, writerId)))
    }
    return results
  }

  labels() {
    return this.calls.map((c) => c.label)
  }

  private reply(label: string, writerId: string): string {
    if (label === 'skribenter-change-check') {
      return JSON.stringify(this.checkReplies.get(writerId) ?? { newTexts: [], events: [], notes: 'ingenting nytt' })
    }
    if (label === 'skribenter-research') {
      return JSON.stringify({
        name: writerId === 'ola-frihet' ? 'Ola Frihet' : 'Kari Marked',
        tagline: `Tagline for ${writerId}`,
        born: 1970,
        died: null,
        image: { url: `https://img.example/${writerId}.jpg`, credit: 'Fotograf X', license: 'CC BY-SA 4.0' },
        platforms: [{ type: 'x', url: `https://x.com/${writerId}` }],
        links: [{ type: 'wikipedia', url: `https://no.wikipedia.org/wiki/${writerId}` }],
        keyFacts: ['Fakta'],
        freedomContributions: ['Forsvarer ytringsfrihet'],
        themes: ['ytringsfrihet', 'skatt'],
        texts: [
          { title: `Frihetsboka av ${writerId}`, date: '2015', kind: 'bok', publication: 'Forlaget' },
          { title: 'En kronikk', url: `https://avis.example/${writerId}/kronikk`, date: '2020-05-17', kind: 'kronikk' },
        ],
        ...this.researchPatch.get(writerId),
      })
    }
    if (label === 'skribenter-write') {
      return `## Hvem er ${writerId}\n\nProfiltekst for ${writerId}. ${'Fyllord om frihet. '.repeat(50)}`
    }
    throw new Error(`ukjent label ${label}`)
  }
}

function succeeded(text: string): PipelineBatchResult {
  return {
    type: 'succeeded',
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 1 },
    content: [{ type: 'text', text }],
  }
}

function rss(items: Array<{ title: string; link: string; date: string }>) {
  return `<?xml version="1.0"?><rss><channel><title>Olas blogg</title>${items
    .map((i) => `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link><pubDate>${i.date}</pubDate></item>`)
    .join('')}</channel></rss>`
}

function makeFetch(feedItems: () => Array<{ title: string; link: string; date: string }>): FetchLike {
  return async (url) => {
    const isImage = url.startsWith('https://img.example/')
    const body = isImage ? '' : rss(feedItems())
    return {
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name === 'content-type' ? (isImage ? 'image/jpeg' : 'application/rss+xml') : null) },
      text: async () => body,
      arrayBuffer: async () => new Uint8Array(isImage ? [0xff, 0xd8, 0xff] : []).buffer,
    }
  }
}

class RecordingPublisher implements Publisher {
  public published: PublishedFile[][] = []
  public fail = false
  async publish(files: PublishedFile[]) {
    if (this.fail) throw new Error('GitHub er nede')
    this.published.push(files)
    return {}
  }
}

const refused: PipelineBatchResult = {
  type: 'succeeded',
  stopReason: 'refusal',
  usage: { inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0 },
  content: [],
}

describe('skribenter pipeline', () => {
  let tempDir = ''
  let feed: Array<{ title: string; link: string; date: string }>

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skribenter-test-'))
    await fs.writeFile(path.join(tempDir, 'registry.json'), JSON.stringify({ writers: WRITERS }))
    for (const name of ['manifest.md', 'manifest-kort.md', 'stil.md']) {
      await fs.writeFile(path.join(tempDir, name), `# ${name}`)
    }
    feed = [{ title: 'Første post', link: 'https://ola.example/1', date: 'Mon, 01 Sep 2026 10:00:00 GMT' }]
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  function run(
    transport: MockTransport,
    now: string,
    extra: Record<string, unknown> = {},
    publisher = new RecordingPublisher(),
  ) {
    const promise = runSkribenterPipeline({
      registryFile: path.join(tempDir, 'registry.json'),
      outputDir: path.join(tempDir, 'out'),
      manifestFile: path.join(tempDir, 'manifest.md'),
      manifestKortFile: path.join(tempDir, 'manifest-kort.md'),
      styleFile: path.join(tempDir, 'stil.md'),
      store: new LocalWriterStore(path.join(tempDir, 'state')),
      transport,
      publisher,
      fetchFn: makeFetch(() => feed),
      now: new Date(now),
      ...extra,
    })
    return promise.then((summary) => ({ summary, publisher }))
  }

  it('første kjøring: full profilering av alle, uten endringssjekk', async () => {
    const transport = new MockTransport()
    const { summary, publisher } = await run(transport, '2026-09-27T06:00:00Z')

    expect(summary.decisions.map((d) => d.action)).toEqual(['full', 'full'])
    expect(transport.labels()).toEqual(['skribenter-research', 'skribenter-write'])

    const page = await fs.readFile(path.join(tempDir, 'out', 'site', 'ola-frihet.md'), 'utf8')
    expect(page).toContain('title: Ola Frihet')
    expect(page).toContain('image: /img/skribenter/ola-frihet.jpg')
    expect(page).toContain('## Egne kanaler')
    expect(page).toContain('[Substack](https://ola.substack.com/)')
    expect(page).toContain('[Wikipedia](https://no.wikipedia.org/wiki/ola-frihet)')
    expect(page).toContain('Profiltekst for ola-frihet.')
    expect(page).toContain('## Tekster av Ola Frihet')
    // Kronologisk: boka (2015) før kronikken (2020) før feed-posten (2026)
    const order = ['Frihetsboka', 'En kronikk', 'Første post'].map((t) => page.indexOf(t))
    expect(order).toEqual([...order].sort((a, b) => a - b))

    const index = await fs.readFile(path.join(tempDir, 'out', 'site', '_index.md'), 'utf8')
    expect(index).toContain('[Ola Frihet](/skribenter/ola-frihet/)')
    expect(index).toContain('[Kari Marked](/skribenter/kari-marked/)')

    const paths = publisher.published[0].map((f) => f.path)
    expect(paths).toContain('content/skribenter/ola-frihet.md')
    expect(paths).toContain('content/skribenter/_index.md')
    expect(paths).toContain('static/img/skribenter/ola-frihet.jpg')
  })

  it('ingenting nytt: bare billig endringssjekk, ingen research eller skriving', async () => {
    await run(new MockTransport(), '2026-09-01T06:00:00Z')
    const pageBefore = await fs.readFile(path.join(tempDir, 'out', 'site', 'ola-frihet.md'), 'utf8')

    const transport = new MockTransport()
    const { summary } = await run(transport, '2026-09-27T06:00:00Z')

    expect(transport.labels()).toEqual(['skribenter-change-check'])
    expect(summary.decisions.every((d) => d.action === 'skip')).toBe(true)
    const pageAfter = await fs.readFile(path.join(tempDir, 'out', 'site', 'ola-frihet.md'), 'utf8')
    expect(pageAfter).toBe(pageBefore)
  })

  it('nylig sjekket og tom feed: ingen LLM-kall i det hele tatt', async () => {
    await run(new MockTransport(), '2026-09-25T06:00:00Z')
    const transport = new MockTransport()
    const { summary } = await run(transport, '2026-09-27T06:00:00Z')
    expect(transport.calls).toHaveLength(0)
    expect(summary.decisions.every((d) => d.action === 'skip')).toBe(true)
  })

  it('noen få nye tekster: tekstlista oppdateres uten ny profiltekst', async () => {
    await run(new MockTransport(), '2026-09-01T06:00:00Z')

    feed.push({ title: 'Ny post om skatt', link: 'https://ola.example/2', date: 'Fri, 20 Sep 2026 10:00:00 GMT' })
    const transport = new MockTransport()
    transport.checkReplies.set('kari-marked', {
      newTexts: [{ title: 'Kronikk om moms', url: 'https://avis.example/moms', date: '2026-09-10', kind: 'kronikk' }],
      events: [{ description: 'Deltok i paneldebatt', significance: 'low' }],
      notes: '',
    })
    const { summary } = await run(transport, '2026-09-27T06:00:00Z')

    expect(transport.labels()).toEqual(['skribenter-change-check'])
    expect(summary.decisions.map((d) => d.action)).toEqual(['update-list', 'update-list'])

    const ola = await fs.readFile(path.join(tempDir, 'out', 'site', 'ola-frihet.md'), 'utf8')
    expect(ola).toContain('Ny post om skatt')
    expect(ola).toContain('Profiltekst for ola-frihet.')
    const kari = await fs.readFile(path.join(tempDir, 'out', 'site', 'kari-marked.md'), 'utf8')
    expect(kari).toContain('Kronikk om moms')

    // Hendelsen er registrert og utløser ikke noe neste gang
    const state = JSON.parse(await fs.readFile(path.join(tempDir, 'state', 'kari-marked', 'state.json'), 'utf8'))
    expect(state.knownEvents).toHaveLength(1)
  })

  it('vesentlig hendelse: full ny profilering bare for den skribenten', async () => {
    await run(new MockTransport(), '2026-09-01T06:00:00Z')
    const transport = new MockTransport()
    transport.checkReplies.set('kari-marked', {
      newTexts: [],
      events: [{ description: 'Ga ut ny bok om eiendomsrett', date: '2026-09-15', significance: 'high' }],
      notes: '',
    })
    const { summary } = await run(transport, '2026-09-27T06:00:00Z')

    expect(transport.labels()).toEqual(['skribenter-change-check', 'skribenter-research', 'skribenter-write'])
    const research = transport.calls.find((c) => c.label === 'skribenter-research')!
    expect(research.requests.map((r) => (r.meta as { writerId: string }).writerId)).toEqual(['kari-marked'])
    const prompt = JSON.stringify(research.requests[0].params.messages)
    expect(prompt).toContain('Ga ut ny bok om eiendomsrett')
    expect(prompt).toContain('Forrige profil')
    expect(summary.decisions.find((d) => d.writerId === 'ola-frihet')?.action).toBe('skip')
  })

  it('--force for én id tvinger full profilering bare for den', async () => {
    await run(new MockTransport(), '2026-09-26T06:00:00Z')
    const transport = new MockTransport()
    const { summary } = await run(transport, '2026-09-27T06:00:00Z', { force: ['ola-frihet'] })
    expect(summary.decisions.find((d) => d.writerId === 'ola-frihet')?.action).toBe('full')
    expect(summary.decisions.find((d) => d.writerId === 'kari-marked')?.action).toBe('skip')
  })

  async function readState(id: string) {
    return JSON.parse(await fs.readFile(path.join(tempDir, 'state', id, 'state.json'), 'utf8'))
  }

  it('feilet research etter vesentlig hendelse: huskes og prøves igjen neste kjøring', async () => {
    await run(new MockTransport(), '2026-09-01T06:00:00Z')

    const failing = new MockTransport()
    failing.checkReplies.set('kari-marked', {
      newTexts: [],
      events: [{ description: 'Ny bok om eiendomsrett', date: '2026-09-15', significance: 'high' }],
      notes: '',
    })
    failing.overrides.set('skribenter-research:kari-marked', refused)
    const first = await run(failing, '2026-09-20T06:00:00Z')

    expect(first.summary.decisions.find((d) => d.writerId === 'kari-marked')?.action).toBe('skip')
    expect(first.summary.problems).toContainEqual(
      expect.objectContaining({ severity: 'error', step: 'research', writerId: 'kari-marked' }),
    )
    const report = await fs.readFile(path.join(tempDir, 'out', 'run-report.md'), 'utf8')
    expect(report).toContain('❌ 1 feil')
    expect(report).toContain('refusal')

    const failedState = await readState('kari-marked')
    expect(failedState.pendingFull.failedAttempts).toBe(1)
    expect(failedState.pendingFull.events[0].description).toBe('Ny bok om eiendomsrett')
    expect(failedState.knownEvents).toHaveLength(0)

    // Neste kjøring: full oppdatering direkte, uten ny endringssjekk, med hendelsen i prompten
    const retry = new MockTransport()
    const second = await run(retry, '2026-09-21T06:00:00Z')
    expect(retry.labels()).toEqual(['skribenter-research', 'skribenter-write'])
    expect(JSON.stringify(retry.calls[0].requests[0].params.messages)).toContain('Ny bok om eiendomsrett')
    expect(second.summary.decisions.find((d) => d.writerId === 'kari-marked')?.action).toBe('full')
    expect(second.summary.problems).toHaveLength(0)

    const okState = await readState('kari-marked')
    expect(okState.pendingFull).toBeUndefined()
    expect(okState.knownEvents.map((e: { description: string }) => e.description)).toEqual(['Ny bok om eiendomsrett'])
  })

  it('første kjøring der skriving feiler: ingen halvferdig side, feilen rapporteres', async () => {
    const transport = new MockTransport()
    transport.overrides.set('skribenter-write:kari-marked', {
      ...refused,
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'For kort.' }],
    })
    const { summary, publisher } = await run(transport, '2026-09-01T06:00:00Z')

    expect(summary.problems).toContainEqual(expect.objectContaining({ step: 'write', writerId: 'kari-marked' }))
    const paths = publisher.published[0].map((f) => f.path)
    expect(paths).toContain('content/skribenter/ola-frihet.md')
    expect(paths).not.toContain('content/skribenter/kari-marked.md')

    const next = new MockTransport()
    const { summary: again } = await run(next, '2026-09-02T06:00:00Z')
    expect(again.decisions.find((d) => d.writerId === 'kari-marked')?.action).toBe('full')
  })

  it('gamle funn fra endringssjekken utløser ingenting', async () => {
    await run(new MockTransport(), '2026-09-01T06:00:00Z')
    const transport = new MockTransport()
    transport.checkReplies.set('kari-marked', {
      newTexts: [{ title: 'Gammel kronikk', url: 'https://avis.example/gammel', date: '2019-03-01', kind: 'kronikk' }],
      events: [{ description: 'Ga ut bok i 2019', date: '2019', significance: 'high' }],
      notes: '',
    })
    const { summary } = await run(transport, '2026-09-27T06:00:00Z')
    expect(transport.labels()).toEqual(['skribenter-change-check'])
    expect(summary.decisions.find((d) => d.writerId === 'kari-marked')?.action).toBe('skip')
  })

  it('endringssjekken får vite om kjente hendelser', async () => {
    await run(new MockTransport(), '2026-09-01T06:00:00Z')
    const t1 = new MockTransport()
    t1.checkReplies.set('kari-marked', {
      newTexts: [],
      events: [{ description: 'Deltok i paneldebatt', date: '2026-09-05', significance: 'low' }],
      notes: '',
    })
    await run(t1, '2026-09-10T06:00:00Z')
    const t2 = new MockTransport()
    await run(t2, '2026-09-20T06:00:00Z')
    const kari = t2.calls[0].requests.find((r) => (r.meta as { writerId: string }).writerId === 'kari-marked')!
    expect(JSON.stringify(kari.params.messages)).toContain('Kjente hendelser')
    expect(JSON.stringify(kari.params.messages)).toContain('Deltok i paneldebatt')
  })

  it('publisering som feiler: tilstanden er lagret, feilen rapporteres', async () => {
    const publisher = new RecordingPublisher()
    publisher.fail = true
    const { summary } = await run(new MockTransport(), '2026-09-01T06:00:00Z', {}, publisher)
    expect(summary.problems).toContainEqual(expect.objectContaining({ severity: 'error', step: 'publish' }))
    expect((await readState('ola-frihet')).lastResearchedAt).toBe('2026-09-01T06:00:00.000Z')
  })

  it('beholder forrige bilde når ny research ikke finner noe', async () => {
    await run(new MockTransport(), '2026-09-01T06:00:00Z')
    const transport = new MockTransport()
    transport.researchPatch.set('ola-frihet', { image: null })
    await run(transport, '2026-09-02T06:00:00Z', { force: ['ola-frihet'] })
    const page = await fs.readFile(path.join(tempDir, 'out', 'site', 'ola-frihet.md'), 'utf8')
    expect(page).toContain('image: /img/skribenter/ola-frihet.jpg')
  })

  it('ukjent id i --only stopper før noe koster penger', async () => {
    const transport = new MockTransport()
    await expect(run(transport, '2026-09-01T06:00:00Z', { only: ['finnes-ikke'] })).rejects.toThrow('finnes-ikke')
    expect(transport.calls).toHaveLength(0)
  })

  it('dry-run skriver requests og kaller ikke transport', async () => {
    await run(new MockTransport(), '2026-09-01T06:00:00Z')
    const { summary } = await run(undefined as unknown as MockTransport, '2026-09-27T06:00:00Z', { dryRun: true })
    expect(summary.decisions).toHaveLength(2)
    const requests = JSON.parse(
      await fs.readFile(path.join(tempDir, 'out', 'dry-run', '01_change-check.requests.json'), 'utf8'),
    )
    expect(requests).toHaveLength(2)
  })
})

describe('beslutningslogikk', () => {
  const entry: WriterRegistryEntry = { id: 'a', name: 'A', description: 'x' }
  const baseStored = () => ({
    state: {
      writerId: 'a',
      registryHash: registryHash(entry),
      templateVersion: 1,
      lastCheckedAt: '2026-09-01T00:00:00Z',
      lastResearchedAt: '2026-09-01T00:00:00Z',
      knownTexts: [],
      knownEvents: [],
    },
    profile: {} as never,
    body: 'tekst',
  })

  it('endret registeroppføring gir full', () => {
    const t = triageWriter({ ...entry, description: 'ny' }, baseStored(), [], new Date('2026-09-10'), false)
    expect(t.kind === 'decided' && t.decision.action).toBe('full')
  })

  it('gammel profil gir full', () => {
    const t = triageWriter(entry, baseStored(), [], new Date('2027-06-01'), false)
    expect(t.kind === 'decided' && t.decision.action).toBe('full')
  })

  it('avdød skribent sjekkes ikke', () => {
    const dead = { ...entry, died: 1982 }
    const stored = baseStored()
    stored.state.registryHash = registryHash(dead)
    const t = triageWriter(dead, stored, [], new Date('2026-12-01'), false)
    expect(t.kind === 'decided' && t.decision.action).toBe('skip')
  })

  it('en tidligere feilet full oppdatering gir full', () => {
    const stored = baseStored()
    ;(stored.state as Record<string, unknown>).pendingFull = {
      reasons: ['vesentlig hendelse: x'],
      events: [],
      failedAttempts: 1,
      lastError: 'research feilet',
    }
    const t = triageWriter(entry, stored, [], new Date('2026-09-02'), false)
    expect(t.kind === 'decided' && t.decision.action).toBe('full')
  })

  it('suggested/enabled endrer ikke registerhashen', () => {
    expect(registryHash({ ...entry, suggested: true, enabled: true })).toBe(registryHash(entry))
  })

  it('filtrerer funn datert før forrige sjekk, med slakk', () => {
    const { kept, dropped } = dropStaleFindings(
      [{ date: '2019' }, { date: '2026-08' }, { date: '2026-06-01' }, {}, { date: 'ukjent' }],
      '2026-09-01T00:00:00Z',
    )
    expect(dropped).toEqual([{ date: '2019' }, { date: '2026-06-01' }])
    expect(kept).toHaveLength(3)
  })

  it('validerer registeret', () => {
    expect(() => validateRegistry([entry, { ...entry }])).toThrow('duplisert')
    expect(() => validateRegistry([{ ...entry, id: 'Æ ø' }])).toThrow('ugyldig id')
    expect(() => validateRegistry([{ ...entry, feeds: ['ftp://x'] }])).toThrow('feed')
  })

  it('mange nye tekster gir full', () => {
    const texts = Array.from({ length: 5 }, (_, i) => ({ title: `t${i}` }))
    expect(resolveDecision('a', texts, []).action).toBe('full')
    expect(resolveDecision('a', texts.slice(0, 2), []).action).toBe('update-list')
    expect(resolveDecision('a', [], [{ description: 'x', significance: 'low' }]).action).toBe('skip')
  })
})

describe('hjelpefunksjoner', () => {
  it('normaliserer URL-er for deduplisering', () => {
    expect(normalizeUrl('http://www.Example.com/a/?utm_source=x#top')).toBe('https://example.com/a')
  })

  it('slår sammen tekster uten duplikater og fyller ut manglende felt', () => {
    const { merged, added } = mergeTexts(
      [{ title: 'A', url: 'https://x.no/a' }],
      [
        { title: 'A', url: 'https://www.x.no/a/', date: '2020-01-01' },
        { title: 'B', date: '2021' },
      ],
      '2026-01-01T00:00:00Z',
    )
    expect(merged).toHaveLength(2)
    expect(merged[0].date).toBe('2020-01-01')
    expect(added.map((t) => t.title)).toEqual(['B'])
  })

  it('parser RSS og Atom', () => {
    const items = parseFeed(
      rss([{ title: 'Hei &amp; hå', link: 'https://b.no/1', date: 'Tue, 02 Sep 2025 08:00:00 GMT' }]),
    )
    expect(items[0]).toMatchObject({ title: 'Hei & hå', url: 'https://b.no/1', date: '2025-09-02', publication: 'Olas blogg' })

    const atom = parseFeed(
      '<feed><title>F</title><entry><title>E</title><link rel="alternate" href="https://c.no/e"/><published>2024-01-02T00:00:00Z</published></entry></feed>',
    )
    expect(atom[0]).toMatchObject({ title: 'E', url: 'https://c.no/e', date: '2024-01-02' })
  })

  it('grupperer tekstlista per år med udaterte sist', () => {
    const md = renderTextList([{ title: 'Udatert' }, { title: 'Ny', date: '2024-02-01' }, { title: 'Gammel', date: '2001' }])
    expect(md.indexOf('### 2001')).toBeLessThan(md.indexOf('### 2024'))
    expect(md.indexOf('### 2024')).toBeLessThan(md.indexOf('### Udatert'))
  })
})
