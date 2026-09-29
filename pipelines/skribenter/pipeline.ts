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
import { dropStaleFindings, resolveDecision, triageWriter, unseenEvents } from './decide.ts'
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
  RunProblem,
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
export interface WriterRun {
  entry: WriterRegistryEntry
  stored: StoredWriter | null
  /** Tekster funnet denne kjøringen som ikke var kjent fra før. */
  pendingTexts: WrittenText[]
  /** Hendelser fra endringssjekken (eller en tidligere feilet kjøring) som ikke er tatt hensyn til. */
  pendingEvents: NewsEvent[]
  checked: boolean
  decision?: WriterDecision
  profile?: WriterProfile
  body?: string
  image?: StoredWriter['image']
  /** Satt når en full oppdatering var bestemt, men research eller skriving feilet. */
  fullFailure?: { reasons: string[]; error: string }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  const problems: RunProblem[] = []
  const problem = (p: RunProblem) => {
    problems.push(p)
    const who = p.writerId ? ` ${p.writerId}` : ''
    console.warn(`[${p.step}]${who}: ${p.message}`)
  }

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
  validateRegistry(allEntries)
  const unknownIds = [...(options.only ?? []), ...(Array.isArray(options.force) ? options.force : [])].filter(
    (id) => !allEntries.some((e) => e.id === id),
  )
  if (unknownIds.length > 0) {
    throw new Error(`Ukjent eller deaktivert skribent-id i only/force: ${unknownIds.join(', ')}`)
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
        for (const error of errors) problem({ severity: 'warning', step: 'feed', writerId: entry.id, message: error })
        pendingTexts = mergeTexts(stored?.state.knownTexts ?? [], items, runAt).added
      }
      // Hendelser fra en tidligere full oppdatering som feilet, tas med videre.
      const pendingEvents = stored?.state.pendingFull?.events ?? []
      return { entry, stored, pendingTexts, pendingEvents, checked: false }
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
      .map((run) => buildResearchRequest(run.entry, run.stored, run.pendingTexts, run.pendingEvents, manifestKort))
    if (researchRequests.length > 0) {
      await writeJsonFile(path.join(outputDir, 'dry-run', '02_research.requests.json'), researchRequests)
    }
    for (const run of needsCheck) {
      run.decision = { writerId: run.entry.id, action: 'skip', reasons: ['dry-run: endringssjekk ikke kjørt'] }
    }
    const decisions = Array.from(runs.values()).map((r) => r.decision!)
    await writeRunReport(outputDir, { runAt, decisions, usage, files: [], problems })
    printDecisions(decisions)
    return { decisions, usage, changedFiles: [], problems }
  }

  if (checkRequests.length > 0) {
    const { results, usage: u } = await runBatch(transport!, 'skribenter-change-check', checkRequests)
    usage = addUsage(usage, u)
    const { checks, failures } = parseChangeCheckResults(checkRequests, results)
    for (const run of needsCheck) {
      const check = checks.get(run.entry.id)
      if (!check) {
        problem({
          severity: 'error',
          step: 'change-check',
          writerId: run.entry.id,
          message: `${failures.get(run.entry.id)} — prøves igjen neste kjøring`,
        })
        run.decision = resolveDecision(run.entry.id, run.pendingTexts, [], ['endringssjekk feilet'])
        continue
      }
      run.checked = true
      await writeJsonFile(path.join(outputDir, 'runs', run.entry.id, 'change-check.json'), check)

      const since = run.stored?.state.lastCheckedAt ?? run.stored?.state.lastResearchedAt
      const texts = dropStaleFindings(check.newTexts, since)
      const events = dropStaleFindings(check.events, since)
      const dropped = texts.dropped.length + events.dropped.length
      if (dropped > 0) {
        console.log(`[steg 1] ${run.entry.id}: ignorerte ${dropped} funn datert før forrige sjekk`)
      }

      const known = [...(run.stored?.state.knownTexts ?? []), ...run.pendingTexts]
      const added = mergeTexts(known, texts.kept, runAt).added
      run.pendingTexts = [...run.pendingTexts, ...added]
      run.pendingEvents = [
        ...run.pendingEvents,
        ...unseenEvents(events.kept, [...(run.stored?.state.knownEvents ?? []), ...run.pendingEvents]),
      ]
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
      const error = `research feilet: ${failures.get(run.entry.id)}`
      problem({ severity: 'error', step: 'research', writerId: run.entry.id, message: error })
      degrade(run, error)
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
        await writeMarkdownFile(path.join(outputDir, 'runs', run.entry.id, 'profiltekst.md'), body)
        continue
      }
      const error = `skriving feilet: ${failures.get(run.entry.id)}`
      problem({ severity: 'error', step: 'write', writerId: run.entry.id, message: error })
      degrade(run, error)
    }
    console.log(`[steg 3] Ferdig (${formatUsage(u)})`)
  }

  // -------------------------------------------------------------------------
  // Steg 4: Bilder + oppdater tilstand
  // -------------------------------------------------------------------------
  const finalWriters: Array<{ entry: WriterRegistryEntry; stored: StoredWriter }> = []
  for (const run of runs.values()) {
    if (run.profile && run.body) {
      await resolveImage(run, fetchFn, (message) =>
        problem({ severity: 'warning', step: 'image', writerId: run.entry.id, message }),
      )
    }
    const { stored, touched } = nextStoredWriter(run, runAt)
    if (touched) await store.save(run.entry.id, stored)
    if (stored.body) finalWriters.push({ entry: run.entry, stored })
  }

  // Skribenter utenfor --only skal fortsatt med på oversiktssiden.
  if (options.only?.length) {
    for (const entry of allEntries.filter((e) => !runs.has(e.id))) {
      const stored = await store.load(entry.id)
      if (stored?.body) finalWriters.push({ entry, stored })
    }
  }

  // Tilstanden lagres FØR publisering: feiler publiseringen, er LLM-arbeidet
  // likevel tatt vare på, og neste kjøring publiserer sidene (de rendres alltid
  // på nytt fra tilstanden). Motsatt rekkefølge ville kastet bort arbeidet.
  try {
    await store.flush(`chore(skribenter): oppdater tilstand ${runAt.slice(0, 10)}`)
  } catch (error) {
    problem({
      severity: 'error',
      step: 'state',
      message: `klarte ikke å lagre tilstand: ${errorMessage(error)} — neste kjøring gjør arbeidet på nytt`,
    })
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
  if (options.publisher) {
    try {
      prUrl = (await options.publisher.publish(files, decisionsMarkdown(decisions), problemsMarkdown(problems))).prUrl
    } catch (error) {
      problem({ severity: 'error', step: 'publish', message: `publisering feilet: ${errorMessage(error)}` })
    }
  }

  await writeRunReport(outputDir, { runAt, decisions, usage, files: files.map((f) => f.path), problems, prUrl })

  return { decisions, usage, changedFiles: files.map((f) => f.path), prUrl, problems }
}

/** Stopper åpenbare feil i registeret før vi bruker penger på LLM-kall. */
export function validateRegistry(entries: WriterRegistryEntry[]) {
  const ids = new Set<string>()
  const errors: string[] = []
  for (const entry of entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id ?? '')) {
      errors.push(`ugyldig id «${entry.id}» (bare a–z, 0–9 og bindestrek)`)
    }
    if (ids.has(entry.id)) errors.push(`duplisert id: ${entry.id}`)
    ids.add(entry.id)
    if (!entry.name?.trim()) errors.push(`${entry.id}: mangler name`)
    if (!entry.description?.trim()) errors.push(`${entry.id}: mangler description`)
    for (const feed of entry.feeds ?? []) {
      if (!/^https?:\/\//.test(feed)) errors.push(`${entry.id}: ugyldig feed-URL ${feed}`)
    }
  }
  if (errors.length > 0) throw new Error(`Feil i skribent-registeret:\n  • ${errors.join('\n  • ')}`)
}

/**
 * Bildet lastes ned bare når det er nytt. Finner research ikke noe bilde denne
 * gangen, beholdes det forrige, så siden ikke mister bildet sitt.
 */
async function resolveImage(run: WriterRun, fetchFn: FetchLike, warn: (message: string) => void) {
  const previous = run.stored
  const image = run.profile!.image
  if (!image) {
    if (previous?.profile?.image) {
      run.profile = { ...run.profile!, image: previous.profile.image }
      run.image = previous.image ?? null
    }
    return
  }
  if (previous?.profile?.image?.url === image.url && previous.image) {
    run.image = previous.image
    return
  }
  run.image = await downloadImage(run.entry.id, image, fetchFn)
  if (!run.image) warn(`kunne ikke laste ned ${image.url} — siden lenker direkte til bildet`)
}

/**
 * Regner ut ny tilstand for én skribent etter kjøringen. Samlet på ett sted
 * fordi det er her inkrementaliteten avgjøres:
 *
 * - `full` fullført: alt oppdateres, hendelsene regnes som tatt hensyn til.
 * - `full` feilet: profilen står, men hendelsene regnes IKKE som tatt hensyn
 *   til; `pendingFull` gjør at neste kjøring prøver igjen.
 * - `update-list`: bare tekstlista vokser.
 * - `skip`: bare sjekk-tidspunktet oppdateres (hvis endringssjekken kjørte).
 */
export function nextStoredWriter(
  run: WriterRun,
  runAt: string,
): { stored: StoredWriter; touched: boolean } {
  const previous = run.stored
  const base = previous?.state ?? emptyState(run.entry)
  const fullDone = !!(run.profile && run.body)
  const incoming = [...run.pendingTexts, ...(fullDone ? run.profile!.texts : [])]
  const { merged } = mergeTexts(base.knownTexts, incoming, runAt)

  const state: WriterState = {
    ...base,
    knownTexts: merged,
    lastCheckedAt: run.checked ? runAt : base.lastCheckedAt,
    lastDecision: run.decision,
  }

  if (fullDone) {
    Object.assign(state, {
      knownEvents: [...base.knownEvents, ...run.pendingEvents],
      registryHash: registryHash(run.entry),
      templateVersion: PROFILE_TEMPLATE_VERSION,
      lastResearchedAt: runAt,
      lastWrittenAt: runAt,
      lastCheckedAt: runAt,
    })
    delete state.pendingFull
  } else if (run.fullFailure) {
    state.pendingFull = {
      reasons: run.fullFailure.reasons,
      events: run.pendingEvents,
      failedAttempts: (base.pendingFull?.failedAttempts ?? 0) + 1,
      lastError: run.fullFailure.error,
    }
  } else {
    // Hendelser som ikke var vesentlige nok til omskriving er nå «sett».
    state.knownEvents = [...base.knownEvents, ...run.pendingEvents]
  }

  const image = fullDone ? run.image ?? null : previous?.image ?? null
  state.imagePath = image?.fileName ?? null
  const stored: StoredWriter = {
    state,
    profile: fullDone ? run.profile! : previous?.profile ?? null,
    body: fullDone ? run.body! : previous?.body ?? null,
    image,
  }
  const touched =
    run.decision?.action !== 'skip' || run.checked || run.pendingEvents.length > 0 || !!run.fullFailure
  return { stored, touched }
}

/**
 * Når research eller skriving feiler: behold den gamle profilen, men ta med
 * nye tekster i lista om vi har noen. Feilen huskes, så neste kjøring prøver
 * full oppdatering igjen.
 */
function degrade(run: WriterRun, error: string) {
  const hasPrevious = !!run.stored?.body
  run.fullFailure = { reasons: run.decision?.reasons ?? [], error }
  run.decision = {
    writerId: run.entry.id,
    action: hasPrevious && run.pendingTexts.length > 0 ? 'update-list' : 'skip',
    reasons: [...(run.decision?.reasons ?? []), `${error} — prøves igjen neste kjøring`],
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

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function decisionsMarkdown(decisions: WriterDecision[]): string {
  const label = { full: '🔄 Ny profil', 'update-list': '➕ Nye tekster', skip: '— Uendret' }
  return [
    '| Skribent | Handling | Begrunnelse |',
    '|---|---|---|',
    ...decisions.map((d) => `| ${d.writerId} | ${label[d.action]} | ${escapeCell(d.reasons.join('; '))} |`),
  ].join('\n')
}

export function problemsMarkdown(problems: RunProblem[]): string {
  if (problems.length === 0) return '✅ Ingen problemer.'
  const icon = { error: '❌', warning: '⚠️' }
  return [
    '| | Steg | Skribent | Melding |',
    '|---|---|---|---|',
    ...problems.map(
      (p) => `| ${icon[p.severity]} | ${p.step} | ${p.writerId ?? ''} | ${escapeCell(p.message)} |`,
    ),
  ].join('\n')
}

async function writeRunReport(
  outputDir: string,
  report: {
    runAt: string
    decisions: WriterDecision[]
    usage: BatchUsage
    files: string[]
    problems: RunProblem[]
    prUrl?: string
  },
) {
  const errors = report.problems.filter((p) => p.severity === 'error').length
  const warnings = report.problems.length - errors
  const status =
    errors > 0 ? `❌ ${errors} feil, ${warnings} advarsler` : warnings > 0 ? `⚠️ ${warnings} advarsler` : '✅ OK'
  await writeJsonFile(path.join(outputDir, 'run-report.json'), report)
  await writeMarkdownFile(
    path.join(outputDir, 'run-report.md'),
    [
      `# Skribent-kjøring ${report.runAt}`,
      '',
      `**Status:** ${status}`,
      report.prUrl ? `**Pull request:** ${report.prUrl}` : '**Pull request:** ingen (ingen endringer, eller publisering av)',
      '',
      '## Problemer',
      '',
      problemsMarkdown(report.problems),
      '',
      '## Beslutninger',
      '',
      decisionsMarkdown(report.decisions),
      '',
      `**Forbruk:** ${formatUsage(report.usage)}`,
    ].join('\n'),
  )
}
