import { chooseTopic, markTopicAsUsed } from './steps/01-choose-topic.ts'
import type { Topic, ChooseTopicResult } from './steps/01-choose-topic.ts'
import { doResearch } from './steps/02-research.ts'
import type { ResearchResults } from './steps/02-research.ts'
import { findArticleImages } from './steps/03-images.ts'
import type { ArticleImages } from './steps/03-images.ts'
import { writeArticle } from './steps/04-write-article.ts'
import type { Article } from './steps/04-write-article.ts'
import { saveRawdata } from './steps/05-save-rawdata.ts'
import { createPR } from './steps/06-create-pr.ts'
import { assertGitHubAuth } from '../utils/octokit.ts'
import {
  type PipelineState,
  type StepName,
  STEP_ORDER,
  createInitialState,
  saveState,
  loadState,
  initRunDir,
  saveArtifact,
  loadArtifact,
  loadTextArtifact,
  generateRunId,
  isStepCompleted,
  nextIncompleteStep,
} from './pipeline-state.ts'

// ─── Env-var topic injection ─────────────────────────────────────────────────

function readTopicFromEnv(): Topic | null {
  const tema = process.env.ARTIKKEL_TEMA
  if (!tema) return null

  const rawSlug = process.env.ARTIKKEL_SLUG?.trim()
  const slug = rawSlug
    ? rawSlug
    : tema
        .toLowerCase()
        .replace(/[åæ]/g, 'a')
        .replace(/ø/g, 'o')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

  const pitch = process.env.ARTIKKEL_PITCH?.trim() || undefined

  return { slug, title: tema, ...(pitch ? { pitch } : {}) }
}

function log(step: string, message: string): void {
  console.log(`[${new Date().toISOString()}] ${step} ${message}`)
}

// ─── Step runners with checkpoint ───────────────────────────────────────────

interface StepContext {
  state: PipelineState
  topic: Topic
  date: string
  research: ResearchResults
  rawBatch: unknown
  images: ArticleImages
  article: Article
  prUrl: string
}

async function runStep(step: StepName, ctx: StepContext): Promise<void> {
  const start = Date.now()
  ctx.state.currentStep = step
  await saveState(ctx.state)

  switch (step) {
    case 'choose-topic': {
      if (ctx.topic) {
        // Topic injected from environment variables — skip automated selection
        log('STEG 1/6', `Emne fra miljøvariabel: ${ctx.topic.slug} — "${ctx.topic.title}"`)
        await saveArtifact(ctx.state.runId, '01-choose-topic.json', {
          topic: ctx.topic,
          candidateLog: [],
        })
      } else {
        log('STEG 1/6', 'Velger emne...')
        const result: ChooseTopicResult = await chooseTopic()
        ctx.topic = result.topic
        await saveArtifact(ctx.state.runId, '01-choose-topic.json', {
          topic: result.topic,
          candidateLog: result.candidateLog,
        })
        log('STEG 1/6', `✓ Valgte emne: ${ctx.topic.slug} — "${ctx.topic.title}"`)
      }
      break
    }

    case 'research': {
      log('STEG 2/6', 'Gjør research via Batch API...')
      const { results, rawBatch } = await doResearch(ctx.topic)
      ctx.research = results
      ctx.rawBatch = rawBatch
      await saveArtifact(ctx.state.runId, '02-research.json', {
        results,
        rawBatch,
      })
      log(
        'STEG 2/6',
        `✓ Research ferdig (${Object.keys(results).length} sub-emner)`,
      )
      break
    }

    case 'images': {
      log('STEG 3/6', 'Finner bilder fra Wikimedia Commons...')
      const { images, searchLog } = await findArticleImages(ctx.topic)
      ctx.images = images
      await saveArtifact(ctx.state.runId, '03-images.json', {
        images,
        searchLog,
      })
      log('STEG 3/6', `✓ Bilder funnet: hero + ${images.inline.length} inline`)
      break
    }

    case 'write-article': {
      log('STEG 4/6', 'Skriver artikkel med Opus...')
      const article = await writeArticle(ctx.topic, ctx.research, ctx.images)
      ctx.article = article
      await saveArtifact(ctx.state.runId, '04-article.json', {
        frontmatter: article.frontmatter,
        pitch: article.pitch,
        socialHook: article.socialHook,
        apiMeta: article.apiMeta,
      })
      await saveArtifact(
        ctx.state.runId,
        '04-article.md',
        article.publishableMarkdown,
      )
      await saveArtifact(ctx.state.runId, '04-article-raw.md', article.raw)
      log('STEG 4/6', `✓ Artikkel skrevet: "${article.frontmatter.title}"`)
      break
    }

    case 'save-rawdata': {
      log('STEG 5/6', 'Lagrer rådata til r-data...')
      await saveRawdata(ctx.topic.slug, ctx.date, ctx.rawBatch)
      log('STEG 5/6', '✓ Rådata lagret')
      break
    }

    case 'create-pr': {
      if (!ctx.article.publishableMarkdown.trim()) {
        throw new Error(
          'publishableMarkdown er tom — avbryter før PR opprettes',
        )
      }
      log('STEG 6/6', 'Oppretter PR mot individet.github.io...')
      ctx.prUrl = await createPR(ctx.article, ctx.images, ctx.date)
      await saveArtifact(ctx.state.runId, '06-pr.json', {
        prUrl: ctx.prUrl,
        slug: ctx.article.frontmatter.slug,
      })
      log('STEG 6/6', `✓ PR opprettet: ${ctx.prUrl}`)
      break
    }
  }

  const durationMs = Date.now() - start
  ctx.state.completedSteps[step] = {
    completedAt: new Date().toISOString(),
    durationMs,
  }
  ctx.state.currentStep = null

  // Update slug in state once topic is chosen
  if (step === 'choose-topic') {
    ctx.state.slug = ctx.topic.slug
  }

  await saveState(ctx.state)
  log(step.toUpperCase(), `Tid: ${(durationMs / 1000).toFixed(1)}s`)
}

// ─── Restore context from saved artifacts ───────────────────────────────────

async function restoreContext(
  state: PipelineState,
): Promise<Partial<StepContext>> {
  const ctx: Partial<StepContext> = { state, date: state.date }

  if (isStepCompleted(state, 'choose-topic')) {
    try {
      const data = await loadArtifact<{ topic: Topic }>(
        state.runId,
        '01-choose-topic.json',
      )
      ctx.topic = data.topic
      log('RESUME', `Lastet topic: ${ctx.topic.slug}`)
    } catch {
      log(
        'RESUME',
        'FEIL: Kunne ikke laste 01-choose-topic.json — starter fra steg 1',
      )
      return ctx
    }
  }

  if (isStepCompleted(state, 'research')) {
    try {
      const data = await loadArtifact<{
        results: ResearchResults
        rawBatch: unknown
      }>(state.runId, '02-research.json')
      ctx.research = data.results
      ctx.rawBatch = data.rawBatch
      log(
        'RESUME',
        `Lastet research: ${Object.keys(data.results).length} sub-emner`,
      )
    } catch {
      log('RESUME', 'FEIL: Kunne ikke laste 02-research.json')
    }
  }

  if (isStepCompleted(state, 'images')) {
    try {
      const data = await loadArtifact<{ images: ArticleImages }>(
        state.runId,
        '03-images.json',
      )
      ctx.images = data.images
      log('RESUME', `Lastet bilder: hero + ${data.images.inline.length} inline`)
    } catch {
      log('RESUME', 'FEIL: Kunne ikke laste 03-images.json')
    }
  }

  if (isStepCompleted(state, 'write-article')) {
    const meta = await loadArtifact<{
      frontmatter: Article['frontmatter']
      pitch: string
      socialHook: string
      apiMeta: Article['apiMeta']
    }>(state.runId, '04-article.json')
    const rawMd = await loadTextArtifact(state.runId, '04-article-raw.md')
    const pubMd = await loadTextArtifact(state.runId, '04-article.md')

    if (!pubMd.trim()) {
      throw new Error(
        `04-article.md er tom! Fjern "write-article" fra completedSteps i pipeline-state.json og kjør på nytt for å regenerere artikkelen.`,
      )
    }

    // Reconstruct article from saved artifacts
    ctx.article = {
      ...meta,
      ingress: '',
      body: '',
      sources: '',
      publishableMarkdown: pubMd,
      raw: rawMd,
    } as Article
    log(
      'RESUME',
      `Lastet artikkel: "${meta.frontmatter.title}" (${pubMd.length} tegn)`,
    )
  }

  return ctx
}

// ─── CLI args ───────────────────────────────────────────────────────────────

function parseArgs(): { resume?: string } {
  const args = process.argv.slice(2)
  // --resume <runId>  (direct tsx invocation)
  const resumeIdx = args.indexOf('--resume')
  if (resumeIdx !== -1 && args[resumeIdx + 1]) {
    return { resume: args[resumeIdx + 1] }
  }
  // bare positional runId — happens when npm swallows --resume as its own flag
  // e.g.  npm run auto-reportasje -- --resume 2026-04-04_...
  // npm consumes --resume; the run ID becomes argv[2] as a plain string
  const positional = args.find((a) => !a.startsWith('-'))
  if (positional) {
    return { resume: positional }
  }
  return {}
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function runPipeline(): Promise<void> {
  const { resume } = parseArgs()
  const envTopic = readTopicFromEnv()
  let state: PipelineState
  let ctx: Partial<StepContext>

  await assertGitHubAuth()

  if (resume) {
    log('PIPELINE', `🔄 Gjenopptar kjøring: ${resume}`)
    state = await loadState(resume)
    state.error = null // Clear previous error
    ctx = await restoreContext(state)
  } else {
    const date = new Date().toISOString().split('T')[0]
    const runId = generateRunId(date)
    await initRunDir(runId)
    state = createInitialState(runId, date)
    await saveState(state)
    ctx = { state, date }
    if (envTopic) {
      ctx.topic = envTopic
      log('PIPELINE', `🚀 Starter artikkel-pipeline for "${envTopic.title}" (run: ${runId})`)
    } else {
      log('PIPELINE', `🚀 Starter auto-reportasje pipeline (run: ${runId})`)
    }
  }

  const startStep = nextIncompleteStep(state)
  if (!startStep) {
    log('PIPELINE', '✅ Alle steg allerede fullført!')
    return
  }

  log('PIPELINE', `Starter fra steg: ${startStep}`)
  log('PIPELINE', `Output-mappe: output/auto-reportasje/${state.runId}/`)

  const startIndex = STEP_ORDER.indexOf(startStep)
  for (let i = startIndex; i < STEP_ORDER.length; i++) {
    const step = STEP_ORDER[i]
    await runStep(step, ctx as StepContext)
  }

  // ── Marker emne som brukt (kun for automatisk emnevalg) ───────────────────
  if (!envTopic) {
    await markTopicAsUsed(ctx.topic!.slug)
  }

  // ── Skriv oppsummering ────────────────────────────────────────────────────
  const summary = {
    runId: state.runId,
    slug: state.slug,
    date: state.date,
    steps: Object.entries(state.completedSteps).map(([name, r]) => ({
      step: name,
      durationMs: r!.durationMs,
      durationFormatted: `${(r!.durationMs / 1000).toFixed(1)}s`,
    })),
    totalDurationMs: Object.values(state.completedSteps).reduce(
      (sum, r) => sum + r!.durationMs,
      0,
    ),
  }
  await saveArtifact(state.runId, 'summary.json', summary)

  log(
    'PIPELINE',
    `✨ Pipeline fullført! Total tid: ${(summary.totalDurationMs / 1000).toFixed(1)}s`,
  )
  log('PIPELINE', `Output: output/auto-reportasje/${state.runId}/`)
}

runPipeline().catch(async (err) => {
  const errorMessage = err instanceof Error ? err.message : String(err)
  const errorStack = err instanceof Error ? err.stack : undefined
  console.error(`[${new Date().toISOString()}] PIPELINE FEIL:`, err)

  // Try to save error state for resume
  try {
    const args = parseArgs()
    if (args.resume) {
      const state = await loadState(args.resume)
      state.error = errorMessage
      await saveState(state)
      console.error(
        `\nFor å gjenoppta: npx tsx pipelines/auto-reportasje/run-pipeline.ts --resume ${args.resume}`,
      )
    } else {
      // Find the most recent state file in output
      const { promises: fs } = await import('fs')
      const { join } = await import('path')
      const outputBase = join('output', 'auto-reportasje')
      try {
        const dirs = await fs.readdir(outputBase)
        const latest = dirs.sort().at(-1)
        if (latest) {
          const state = await loadState(latest)
          state.error = errorMessage
          await saveState(state)
          console.error(
            `\nFor å gjenoppta: npx tsx pipelines/auto-reportasje/run-pipeline.ts --resume ${latest}`,
          )
        }
      } catch {
        // Output dir doesn't exist yet
      }
    }
  } catch {
    // Could not save error state — not critical
  }

  process.exit(1)
})
