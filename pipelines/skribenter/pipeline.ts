import { promises as fs } from 'fs'
import path from 'path'
import { buildChangeCheckRequest, parseChangeCheckResults } from './01_change-check.ts'
import { buildResearchRequest, parseResearchResults } from './02_research.ts'
import { buildWriteProfileRequest, parseWriteProfileResults } from './03_write-profile.ts'
import {
  DEFAULT_MANIFEST_FILE,
  DEFAULT_MANIFEST_KORT_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_REGISTRY_FILE,
  DEFAULT_STYLE_FILE,
  PROFILE_TEMPLATE_VERSION,
  WEBSITE,
} from './constants.ts'
import { resolveDecision, triageWriter, unseenEvents } from './decide.ts'
import { fetchWriterFeeds } from './feeds.ts'
import { downloadImage } from './images.ts'
import { renderIndexPage, renderWriterPage } from './render.ts'
import { LocalWriterStore } from './store.ts'
import { mergeTexts, registryHash } from './texts.ts'
import type {
  BatchTransport,
  BatchUsage,
  FetchLike,
  NewsEvent,
  PipelineBatchRequest,
  PublishedFile,
  RunSkribenterOptions,
  RunSkribenterSummary,
  StoredWriter,
  WriterDecision,
  WriterProfile,
  WriterRegistry,
  WriterRegistryEntry,
  WriterState,
  WrittenText,
} from './types.ts'
import {
  addUsage,
  emptyUsage,
  formatUsage,
  readJsonFile,
  sumBatchUsage,
  writeJsonFile,
  writeMarkdownFile,
} from '../notat/utils.ts'

/** Arbeidsminne for én skribent gjennom kjøringen. */
interface WriterRun {
  entry: WriterRegistryEntry
  stored: StoredWriter | null
  /** Tekster funnet denne kjøringen som ikke var kjent fra før. */
  pendingTexts: WrittenText[]
  /** Hendelser fra endringssjekken som ikke var kjent fra før. */
  pendingEvents: NewsEvent[]
  checked: boolean
  decision?: WriterDecision
  profile?: WriterProfile
  body?: string
  image?: StoredWriter['image']
}

async function runBatch(
  transport: BatchTransport,
  label: string,
  requests: PipelineBatchRequest[],
) {
  const batchId = await transport.createBatch(requests, label)
  await transport.waitForBatch(batchId, label)
  const results = await transport.getBatchResults(batchId)
  return { results, usage: sumBatchUsage(results) }
}

function isForced(force: RunSkribenterOptions['force'], id: string): boolean {
  return force === true || (Array.isArray(force) && force.includes(id))
}

function emptyState(entry: WriterRegistryEntry): WriterState {
  return {
    writerId: entry.id,
    registryHash: registryHash(entry),
    templateVersion: PROFILE_TEMPLATE_VERSION,
    knownTexts: [],
    knownEvents: [],
  }
}

export async function runSkribenterPipeline(
  options: Partial<RunSkribenterOptions> = {},
): Promise<RunSkribenterSummary> {
  const registryFile = options.registryFile ?? DEFAULT_REGISTRY_FILE
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR
  const now = options.now ?? new Date()
  const runAt = now.toISOString()
  const dryRun = options.dryRun ?? false
  const fetchFn: FetchLike = options.fetchFn ?? (fetch as unknown as FetchLike)
  const store = options.store ?? new LocalWriterStore(path.join(outputDir, 'state'))
  const transport = options.transport

  if (!dryRun && !transport) {
    throw new Error('runSkribenterPipeline: transport mangler (kreves utenom --dry-run).')
  }

  const [registry, manifest, manifestKort, styleGuide] = await Promise.all([
    readJsonFile<WriterRegistry>(registryFile),
    fs.readFile(options.manifestFile ?? DEFAULT_MANIFEST_FILE, 'utf8'),
    fs.readFile(options.manifestKortFile ?? DEFAULT_MANIFEST_KORT_FILE, 'utf8'),
    fs.readFile(options.styleFile ?? DEFAULT_STYLE_FILE, 'utf8'),
  ])

  const allEntries = registry.writers.filter((w) => w.enabled !== false)
  const ids = new Set<string>()
  for (const entry of allEntries) {
    if (ids.has(entry.id)) throw new Error(`Duplisert skribent-id i registeret: ${entry.id}`)
    ids.add(entry.id)
  }
  const selected = options.only?.length
    ? allEntries.filter((w) => options.only!.includes(w.id))
    : allEntries

  let usage: BatchUsage = emptyUsage()
  const runs = new Map<string, WriterRun>()

  // -------------------------------------------------------------------------
  // Steg 0: Last tilstand + sjekk RSS/Atom-feeder (gratis, uten LLM)
  // -------------------------------------------------------------------------
  console.log(`\n[steg 0] Laster tilstand og sjekker feeder for ${selected.length} skribenter`)
  const loaded = await Promise.all(
    selected.map(async (entry): Promise<WriterRun> => {
      const stored = await store.load(entry.id)
      let pendingTexts: WrittenText[] = []
      if (!options.skipFeeds && entry.feeds?.length) {
        const { items, errors } = await fetchWriterFeeds(entry.feeds, fetchFn)
        for (const error of errors) console.warn(`[feed] ${entry.id}: ${error}`)
        pendingTexts = mergeTexts(stored?.state.knownTexts ?? [], items, runAt).added
      }
      return { entry, stored, pendingTexts, pendingEvents: [], checked: false }
    }),
  )
  for (const run of loaded) runs.set(run.entry.id, run)

  // -------------------------------------------------------------------------
  // Steg 1: Triage — har noe NYTT skjedd?
  // -------------------------------------------------------------------------
  const needsCheck: WriterRun[] = []
  for (const run of runs.values()) {
    const triage = triageWriter(
      run.entry,
      run.stored,
      run.pendingTexts,
      now,
      isForced(options.force, run.entry.id),
    )
    if (triage.kind === 'decided') run.decision = triage.decision
    else needsCheck.push(run)
  }

  const checkRequests = needsCheck.map((run) =>
    buildChangeCheckRequest(run.entry, run.stored!, run.pendingTexts),
  )
  console.log(
    `[steg 1] ${runs.size - needsCheck.length} avgjort uten LLM, ${needsCheck.length} trenger endringssjekk`,
  )

  if (dryRun) {
    if (checkRequests.length > 0) {
      await writeJsonFile(path.join(outputDir, 'dry-run', '01_change-check.requests.json'), checkRequests)
    }
    const researchRequests = Array.from(runs.values())
      .filter((run) => run.decision?.action === 'full')
      .map((run) => buildResearchRequest(run.entry, run.stored, run.pendingTexts, [], manifestKort))
    if (researchRequests.length > 0) {
      await writeJsonFile(path.join(outputDir, 'dry-run', '02_research.requests.json'), researchRequests)
    }
    for (const run of needsCheck) {
      run.decision = { writerId: run.entry.id, action: 'skip', reasons: ['dry-run: endringssjekk ikke kjørt'] }
    }
    const decisions = Array.from(runs.values()).map((r) => r.decision!)
    await writeRunReport(outputDir, runAt, decisions, usage, [])
    printDecisions(decisions)
    return { decisions, usage, changedFiles: [] }
  }

  if (checkRequests.length > 0) {
    const { results, usage: u } = await runBatch(transport!, 'skribenter-change-check', checkRequests)
    usage = addUsage(usage, u)
    const { checks, failures } = parseChangeCheckResults(checkRequests, results)
    for (const run of needsCheck) {
      const check = checks.get(run.entry.id)
      if (!check) {
        console.warn(`[steg 1] Endringssjekk feilet for ${run.entry.id}: ${failures.get(run.entry.id)}`)
        run.decision = resolveDecision(run.entry.id, run.pendingTexts, [], ['endringssjekk feilet'])
        continue
      }
      run.checked = true
      await writeJsonFile(path.join(outputDir, 'runs', run.entry.id, 'change-check.json'), check)
      const known = [...(run.stored?.state.knownTexts ?? []), ...run.pendingTexts]
      const added = mergeTexts(known, check.newTexts, runAt).added
      run.pendingTexts = [...run.pendingTexts, ...added]
      run.pendingEvents = unseenEvents(check.events, run.stored?.state.knownEvents ?? [])
      run.decision = resolveDecision(run.entry.id, run.pendingTexts, run.pendingEvents)
    }
    console.log(`[steg 1] Ferdig (${formatUsage(u)})`)
  }

  // -------------------------------------------------------------------------
  // Steg 2: Research (kun skribenter med `full`)
  // -------------------------------------------------------------------------
  const fullRuns = Array.from(runs.values()).filter((r) => r.decision?.action === 'full')
  if (fullRuns.length > 0) {
    const requests = fullRuns.map((run) =>
      buildResearchRequest(run.entry, run.stored, run.pendingTexts, run.pendingEvents, manifestKort),
    )
    console.log(`\n[steg 2] Research for ${requests.length} skribenter`)
    const { results, usage: u } = await runBatch(transport!, 'skribenter-research', requests)
    usage = addUsage(usage, u)
    const { profiles, failures } = parseResearchResults(requests, results)
    for (const run of fullRuns) {
      const profile = profiles.get(run.entry.id)
      if (profile) {
        run.profile = profile
        await writeJsonFile(path.join(outputDir, 'runs', run.entry.id, 'profile.json'), profile)
        continue
      }
      console.warn(`[steg 2] Research feilet for ${run.entry.id}: ${failures.get(run.entry.id)}`)
      degrade(run, `research feilet: ${failures.get(run.entry.id)}`)
    }
    console.log(`[steg 2] Ferdig (${formatUsage(u)})`)
  }

  // -------------------------------------------------------------------------
  // Steg 3: Skriv profiltekst (Opus)
  // -------------------------------------------------------------------------
  const writeRuns = fullRuns.filter((r) => r.profile)
  if (writeRuns.length > 0) {
    const requests = writeRuns.map((run) =>
      buildWriteProfileRequest(run.entry, run.profile!, run.stored?.body ?? null, manifest, styleGuide),
    )
    console.log(`\n[steg 3] Skriver profiltekst for ${requests.length} skribenter`)
    const { results, usage: u } = await runBatch(transport!, 'skribenter-write', requests)
    usage = addUsage(usage, u)
    const { bodies, failures } = parseWriteProfileResults(requests, results)
    for (const run of writeRuns) {
      const body = bodies.get(run.entry.id)
      if (body) {
        run.body = body
        continue
      }
      console.warn(`[steg 3] Skriving feilet for ${run.entry.id}: ${failures.get(run.entry.id)}`)
      degrade(run, `skriving feilet: ${failures.get(run.entry.id)}`)
    }
    console.log(`[steg 3] Ferdig (${formatUsage(u)})`)
  }

  // -------------------------------------------------------------------------
  // Steg 4: Bilder + oppdater tilstand
  // -------------------------------------------------------------------------
  const finalWriters: Array<{ entry: WriterRegistryEntry; stored: StoredWriter; changed: boolean }> = []
  for (const run of runs.values()) {
    const action = run.decision!.action
    const previous = run.stored
    const fullDone = action === 'full' && run.profile && run.body

    if (fullDone && run.profile!.image) {
      const sameImage = previous?.profile?.image?.url === run.profile!.image.url && previous?.image
      run.image = sameImage
        ? previous!.image
        : await downloadImage(run.entry.id, run.profile!.image, fetchFn)
    }

    const baseState = previous?.state ?? emptyState(run.entry)
    const incoming = [...run.pendingTexts, ...(fullDone ? run.profile!.texts : [])]
    const { merged } = mergeTexts(baseState.knownTexts, incoming, runAt)

    const stored: StoredWriter = {
      state: {
        ...baseState,
        knownTexts: merged,
        knownEvents: [...baseState.knownEvents, ...run.pendingEvents],
        lastCheckedAt: run.checked ? runAt : baseState.lastCheckedAt,
        lastDecision: run.decision,
        ...(fullDone
          ? {
              registryHash: registryHash(run.entry),
              templateVersion: PROFILE_TEMPLATE_VERSION,
              lastResearchedAt: runAt,
              lastWrittenAt: runAt,
              lastCheckedAt: runAt,
            }
          : {}),
      },
      profile: fullDone ? run.profile! : previous?.profile ?? null,
      body: fullDone ? run.body! : previous?.body ?? null,
      image: fullDone ? run.image ?? null : previous?.image ?? null,
    }

    const touched = action !== 'skip' || run.checked || run.pendingEvents.length > 0
    if (touched) await store.save(run.entry.id, stored)
    if (stored.body) finalWriters.push({ entry: run.entry, stored, changed: action !== 'skip' })
  }

  // Skribenter utenfor --only skal fortsatt med på oversiktssiden.
  if (options.only?.length) {
    for (const entry of allEntries.filter((e) => !runs.has(e.id))) {
      const stored = await store.load(entry.id)
      if (stored?.body) finalWriters.push({ entry, stored, changed: false })
    }
  }

  // -------------------------------------------------------------------------
  // Steg 5: Render sider og publiser
  // -------------------------------------------------------------------------
  // Alle sider rendres (billig og deterministisk); publisher filtrerer bort det
  // som allerede er identisk på nettsiden. Slik repareres også sider som
  // mangler fordi en tidligere PR aldri ble flettet.
  const files: PublishedFile[] = []
  for (const { entry, stored } of finalWriters) {
    const page = renderWriterPage(entry, stored)
    await writeMarkdownFile(path.join(outputDir, 'site', `${entry.id}.md`), page)
    files.push({ path: `${WEBSITE.contentDir}/${entry.id}.md`, content: page })
    if (stored.image) {
      files.push({ path: `${WEBSITE.imageDir}/${stored.image.fileName}`, content: stored.image.data })
    }
  }
  if (finalWriters.length > 0) {
    const index = renderIndexPage(finalWriters)
    await writeMarkdownFile(path.join(outputDir, 'site', '_index.md'), index)
    files.push({ path: `${WEBSITE.contentDir}/_index.md`, content: index })
  }

  const decisions = Array.from(runs.values()).map((r) => r.decision!)
  printDecisions(decisions)
  console.log(`\n[totalt] ${formatUsage(usage)}`)

  let prUrl: string | undefined
  const summaryText = decisionsMarkdown(decisions)
  if (options.publisher) {
    try {
      prUrl = (await options.publisher.publish(files, summaryText)).prUrl
    } catch (error) {
      console.warn(`[publish] Publisering feilet: ${error instanceof Error ? error.message : error}`)
    }
  }

  await store.flush(`chore(skribenter): oppdater tilstand ${runAt.slice(0, 10)}`)
  await writeRunReport(outputDir, runAt, decisions, usage, files.map((f) => f.path))

  return { decisions, usage, changedFiles: files.map((f) => f.path), prUrl }
}

/**
 * Når research eller skriving feiler: behold den gamle profilen, men ta med
 * nye tekster i lista om vi har noen.
 */
function degrade(run: WriterRun, reason: string) {
  const hasPrevious = !!run.stored?.body
  run.decision = {
    writerId: run.entry.id,
    action: hasPrevious && run.pendingTexts.length > 0 ? 'update-list' : 'skip',
    reasons: [...(run.decision?.reasons ?? []), reason],
  }
  run.profile = undefined
  run.body = undefined
}

function printDecisions(decisions: WriterDecision[]) {
  console.log('\n=== Beslutninger ===')
  for (const d of decisions) {
    console.log(`${d.action.padEnd(12)} ${d.writerId.padEnd(26)} ${d.reasons.join('; ')}`)
  }
}

function decisionsMarkdown(decisions: WriterDecision[]): string {
  const label = { full: '🔄 Ny profil', 'update-list': '➕ Nye tekster', skip: '— Uendret' }
  return [
    '| Skribent | Handling | Begrunnelse |',
    '|---|---|---|',
    ...decisions.map((d) => `| ${d.writerId} | ${label[d.action]} | ${d.reasons.join('; ')} |`),
  ].join('\n')
}

async function writeRunReport(
  outputDir: string,
  runAt: string,
  decisions: WriterDecision[],
  usage: BatchUsage,
  files: string[],
) {
  await writeJsonFile(path.join(outputDir, 'run-report.json'), { runAt, decisions, usage, files })
  await writeMarkdownFile(
    path.join(outputDir, 'run-report.md'),
    [`# Skribent-kjøring ${runAt}`, '', decisionsMarkdown(decisions), '', `**Forbruk:** ${formatUsage(usage)}`].join('\n'),
  )
}

