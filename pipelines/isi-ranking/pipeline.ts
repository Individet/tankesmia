import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { promises as fs } from 'fs'
import { createActorDossier, dossierMarkdown } from './00_actor-dossier.ts'
import {
  buildResearchPlanRequests,
  parseResearchPlanResults,
  researchPlanMarkdown,
} from './01_research-plan.ts'
import {
  buildEvidenceHarvestRequests,
  evidenceArtifactMarkdown,
  parseEvidenceHarvestResults,
} from './02_evidence-harvest.ts'
import {
  buildEvidenceReviewRequests,
  evidenceMatrixMarkdown,
  parseEvidenceReviewResults,
} from './03_evidence-review.ts'
import {
  buildScoringDraftRequests,
  parseScoringDraftResults,
  scoreDraftMarkdown,
} from './04_scoring-draft.ts'
import {
  buildGapResearchPlans,
  buildGapResearchRequests,
  mergeEvidenceArtifacts,
  parseGapResearchResults,
} from './05_gap-research.ts'
import {
  buildFinalReportRequests,
  parseFinalReportResults,
} from './06_final-report.ts'
import { publishReports } from './07_github-publish.ts'
import { assertAuth, verifyAuth } from './00_verify-auth.ts'
import { LiveAnthropicBatchTransport } from './anthropic-batch.ts'
import {
  DEFAULT_ACTOR_FILE,
  DEFAULT_FRAMEWORK_FILE,
  DEFAULT_MANIFEST_FILE,
  DEFAULT_MANIFEST_FULL_FILE,
  DEFAULT_MANIFEST_KORT_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_TEMPLATE_FILE,
  SUBDIMENSIONS,
} from './constants.ts'
import type {
  ActorDossier,
  ActorInput,
  BatchUsage,
  EvidenceArtifact,
  EvidenceMatrix,
  ResearchPlan,
  RunPipelineOptions,
  RunPipelineSummary,
  ScoreDraft,
} from './types.ts'
import {
  buildPipelinePaths,
  ensureDir,
  readJsonFile,
  subdimensionFileStem,
  writeJsonFile,
  writeMarkdownFile,
  sumBatchUsage,
  addUsage,
  emptyUsage,
  formatUsage,
} from './utils.ts'

async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

async function loadFromDisk<T>(filePath: string, stepName: string): Promise<T> {
  try {
    return await readJsonFile<T>(filePath)
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `--from-step: Mangler forventet fil fra ${stepName}: ${filePath}\n` +
          `Kjør pipelinen fra et tidligere steg for å generere filen.`,
      )
    }
    throw err
  }
}

async function loadResearchPlans(
  outputDir: string,
  dossiers: ActorDossier[],
): Promise<Map<string, ResearchPlan>> {
  const plans = new Map<string, ResearchPlan>()
  for (const dossier of dossiers) {
    const paths = buildPipelinePaths(outputDir, dossier.actorSlug)
    plans.set(
      dossier.actorSlug,
      await loadFromDisk<ResearchPlan>(paths.researchPlanJson, 'steg 1'),
    )
  }
  return plans
}

async function loadEvidenceArtifacts(
  outputDir: string,
  dossiers: ActorDossier[],
): Promise<Map<string, EvidenceArtifact>> {
  const artifacts = new Map<string, EvidenceArtifact>()
  for (const dossier of dossiers) {
    const paths = buildPipelinePaths(outputDir, dossier.actorSlug)
    for (const subdimension of SUBDIMENSIONS) {
      const fileStem = subdimensionFileStem(subdimension.id)
      const filePath = path.join(paths.evidenceDir, `${fileStem}.json`)
      const artifact = await loadFromDisk<EvidenceArtifact>(filePath, 'steg 2')
      artifacts.set(`${dossier.actorSlug}:${subdimension.id}`, artifact)
    }
  }
  return artifacts
}

async function loadEvidenceMatrices(
  outputDir: string,
  dossiers: ActorDossier[],
): Promise<Map<string, EvidenceMatrix>> {
  const matrices = new Map<string, EvidenceMatrix>()
  for (const dossier of dossiers) {
    const paths = buildPipelinePaths(outputDir, dossier.actorSlug)
    matrices.set(
      dossier.actorSlug,
      await loadFromDisk<EvidenceMatrix>(paths.evidenceMatrixJson, 'steg 3'),
    )
  }
  return matrices
}

async function loadScoreDrafts(
  outputDir: string,
  dossiers: ActorDossier[],
): Promise<Map<string, ScoreDraft>> {
  const drafts = new Map<string, ScoreDraft>()
  for (const dossier of dossiers) {
    const paths = buildPipelinePaths(outputDir, dossier.actorSlug)
    drafts.set(
      dossier.actorSlug,
      await loadFromDisk<ScoreDraft>(paths.scoreDraftJson, 'steg 4'),
    )
  }
  return drafts
}

async function saveDryRunRequests(
  outputDir: string,
  fileName: string,
  requests: unknown[],
): Promise<void> {
  await writeJsonFile(path.join(outputDir, fileName), requests)
}

async function writeDossiers(outputDir: string, actors: ActorInput[]) {
  const dossiers = actors.map(createActorDossier)
  for (const dossier of dossiers) {
    const paths = buildPipelinePaths(outputDir, dossier.actorSlug)
    await writeJsonFile(paths.dossierJson, dossier)
    await writeMarkdownFile(
      path.join(paths.actorDir, 'actor-dossier.md'),
      dossierMarkdown(dossier),
    )
  }
  return dossiers
}

async function writeResearchPlans(
  outputDir: string,
  plans: Map<string, ResearchPlan>,
): Promise<void> {
  for (const [actorSlug, plan] of plans) {
    const paths = buildPipelinePaths(outputDir, actorSlug)
    await writeJsonFile(paths.researchPlanJson, plan)
    await writeMarkdownFile(
      paths.sourcePriorityMarkdown,
      researchPlanMarkdown(plan),
    )
  }
}

async function writeEvidenceArtifacts(
  outputDir: string,
  artifacts: Map<string, EvidenceArtifact>,
): Promise<void> {
  for (const [key, artifact] of artifacts) {
    const [actorSlug, subdimensionId] = key.split(':')
    const paths = buildPipelinePaths(outputDir, actorSlug)
    const fileStem = subdimensionFileStem(subdimensionId)
    await writeJsonFile(
      path.join(paths.evidenceDir, `${fileStem}.json`),
      artifact,
    )
    await writeMarkdownFile(
      path.join(paths.evidenceDir, `${fileStem}.md`),
      evidenceArtifactMarkdown(artifact),
    )
  }
}

async function writeMatrices(
  outputDir: string,
  matrices: Map<string, EvidenceMatrix>,
): Promise<void> {
  for (const [actorSlug, matrix] of matrices) {
    const paths = buildPipelinePaths(outputDir, actorSlug)
    await writeJsonFile(paths.evidenceMatrixJson, matrix)
    await writeMarkdownFile(
      paths.evidenceMatrixMarkdown,
      evidenceMatrixMarkdown(matrix),
    )
  }
}

async function writeScoreDrafts(
  outputDir: string,
  drafts: Map<string, ScoreDraft>,
): Promise<void> {
  for (const [actorSlug, draft] of drafts) {
    const paths = buildPipelinePaths(outputDir, actorSlug)
    await writeJsonFile(paths.scoreDraftJson, draft)
    await writeMarkdownFile(paths.scoreDraftMarkdown, scoreDraftMarkdown(draft))
  }
}

async function writeGapResolution(
  outputDir: string,
  actorSlug: string,
  payload: unknown,
): Promise<void> {
  const paths = buildPipelinePaths(outputDir, actorSlug)
  await writeJsonFile(paths.gapResolutionJson, payload)
}

async function writeReports(
  outputDir: string,
  reports: Map<string, string>,
): Promise<void> {
  for (const [actorSlug, report] of reports) {
    const paths = buildPipelinePaths(outputDir, actorSlug)
    await writeMarkdownFile(paths.reportMarkdown, report)
  }
}

export async function runIsiRankingPipeline(
  options: Partial<RunPipelineOptions> = {},
): Promise<RunPipelineSummary> {
  const actorFile = options.actorFile ?? DEFAULT_ACTOR_FILE
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR
  const manifestFile = options.manifestFile ?? DEFAULT_MANIFEST_FILE
  const manifestKortFile =
    options.manifestKortFile ?? DEFAULT_MANIFEST_KORT_FILE
  const manifestFullFile =
    options.manifestFullFile ?? DEFAULT_MANIFEST_FULL_FILE
  const frameworkFile = options.frameworkFile ?? DEFAULT_FRAMEWORK_FILE
  const templateFile = options.templateFile ?? DEFAULT_TEMPLATE_FILE
  const dryRun = options.dryRun ?? false
  const skipGapResearch = options.skipGapResearch ?? false
  const fromStep = options.fromStep ?? 1
  const transport =
    options.transport ??
    (dryRun ? undefined : new LiveAnthropicBatchTransport())

  await ensureDir(outputDir)

  if (!dryRun && !options.transport) {
    const authResult = await verifyAuth()
    assertAuth(authResult)
  }

  const actors = options.envActors ?? await readJsonFile<ActorInput[]>(actorFile)
  const framework = await readTextFile(frameworkFile)
  const template = await readTextFile(templateFile)
  const manifest = await readTextFile(manifestFile)
  const manifestKort = await readTextFile(manifestKortFile)
  const manifestFull = await readTextFile(manifestFullFile)

  const dossiers = await writeDossiers(outputDir, actors)
  const actorCount = dossiers.length
  const stateFile = path.join(outputDir, 'pipeline-state.json')
  const existingState = existsSync(stateFile)
    ? (JSON.parse(readFileSync(stateFile, 'utf-8')) as {
        batches?: Record<string, string>
      })
    : {}
  const pipelineState: Record<string, string> = existingState.batches ?? {}

  async function recordBatch(label: string, batchId: string): Promise<void> {
    pipelineState[label] = batchId
    await writeJsonFile(stateFile, {
      startedAt: new Date().toISOString(),
      batches: pipelineState,
    })
  }

  const researchPlanRequests = buildResearchPlanRequests(
    dossiers,
    framework,
    manifest,
  )
  if (dryRun) {
    await saveDryRunRequests(
      outputDir,
      '01_research-plan.requests.json',
      researchPlanRequests,
    )
    await saveDryRunRequests(
      outputDir,
      '02_evidence-harvest.requests.json',
      buildEvidenceHarvestRequests(
        dossiers,
        new Map(
          dossiers.map((dossier) => [
            dossier.actorSlug,
            {
              actorSlug: dossier.actorSlug,
              actorName: dossier.actor.name,
              generatedAt: dossier.generatedAt,
              profileSummary: '',
              primarySourcePriorities: [],
              secondarySourcePriorities: [],
              sourcePriorityNotes: [],
              subdimensions: [],
            },
          ]),
        ),
        framework,
        manifestKort,
      ),
    )
    return {
      outputDir,
      actorCount: dossiers.length,
      reportsGenerated: 0,
      gapResearchRequests: 0,
    }
  }

  let totalUsage: BatchUsage = emptyUsage()

  // Steg 1: Forskningsplaner
  let researchPlans: Map<string, ResearchPlan>
  if (fromStep <= 1) {
    console.log(
      `\n[steg 1] Forskningsplaner — ${actorCount} aktør(er), ${researchPlanRequests.length} kall`,
    )
    const researchPlanBatchId = await transport!.createBatch(
      researchPlanRequests,
      'isi-ranking-research-plan',
    )
    await recordBatch('isi-ranking-research-plan', researchPlanBatchId)
    await transport!.waitForBatch(
      researchPlanBatchId,
      'isi-ranking-research-plan',
    )
    const researchPlanResults =
      await transport!.getBatchResults(researchPlanBatchId)
    researchPlans = parseResearchPlanResults(
      researchPlanRequests,
      researchPlanResults,
    )
    await writeResearchPlans(outputDir, researchPlans)
    const planUsage = sumBatchUsage(researchPlanResults)
    totalUsage = addUsage(totalUsage, planUsage)
    console.log(`[steg 1] Ferdig (${formatUsage(planUsage)})`)
  } else {
    console.log(
      `\n[steg 1] Hoppet over (--from-step=${fromStep}) — laster fra disk`,
    )
    researchPlans = await loadResearchPlans(outputDir, dossiers)
  }

  // Steg 2: Bevisinnsamling
  let evidenceArtifacts: Map<string, EvidenceArtifact>
  if (fromStep <= 2) {
    const evidenceHarvestRequests = buildEvidenceHarvestRequests(
      dossiers,
      researchPlans,
      framework,
      manifestKort,
    )
    console.log(
      `\n[steg 2] Bevisinnsamling — ${actorCount} aktør(er), ${evidenceHarvestRequests.length} kall`,
    )
    const evidenceBatchId = await transport!.createBatch(
      evidenceHarvestRequests,
      'isi-ranking-evidence',
    )
    await recordBatch('isi-ranking-evidence', evidenceBatchId)
    await transport!.waitForBatch(evidenceBatchId, 'isi-ranking-evidence')
    const evidenceResults = await transport!.getBatchResults(evidenceBatchId)
    evidenceArtifacts = parseEvidenceHarvestResults(
      evidenceHarvestRequests,
      evidenceResults,
    )
    await writeEvidenceArtifacts(outputDir, evidenceArtifacts)
    const evidenceUsage = sumBatchUsage(evidenceResults)
    totalUsage = addUsage(totalUsage, evidenceUsage)
    console.log(`[steg 2] Ferdig (${formatUsage(evidenceUsage)})`)
  } else {
    console.log(
      `\n[steg 2] Hoppet over (--from-step=${fromStep}) — laster fra disk`,
    )
    evidenceArtifacts = await loadEvidenceArtifacts(outputDir, dossiers)
  }

  // Steg 3: Evidensmatrise
  let evidenceMatrices: Map<string, EvidenceMatrix>
  if (fromStep <= 3) {
    const reviewRequests = buildEvidenceReviewRequests(
      dossiers,
      evidenceArtifacts,
      framework,
      manifestKort,
    )
    console.log(
      `\n[steg 3] Evidensmatrise — ${actorCount} aktør(er), ${reviewRequests.length} kall`,
    )
    const reviewBatchId = await transport!.createBatch(
      reviewRequests,
      'isi-ranking-matrix',
    )
    await recordBatch('isi-ranking-matrix', reviewBatchId)
    await transport!.waitForBatch(reviewBatchId, 'isi-ranking-matrix')
    const reviewResults = await transport!.getBatchResults(reviewBatchId)
    evidenceMatrices = parseEvidenceReviewResults(reviewRequests, reviewResults)
    await writeMatrices(outputDir, evidenceMatrices)
    const reviewUsage = sumBatchUsage(reviewResults)
    totalUsage = addUsage(totalUsage, reviewUsage)
    console.log(`[steg 3] Ferdig (${formatUsage(reviewUsage)})`)
  } else {
    console.log(
      `\n[steg 3] Hoppet over (--from-step=${fromStep}) — laster fra disk`,
    )
    evidenceMatrices = await loadEvidenceMatrices(outputDir, dossiers)
  }

  // Steg 4: Scoring-utkast
  let scoreDrafts: Map<string, ScoreDraft>
  if (fromStep <= 4) {
    const scoringRequests = buildScoringDraftRequests(
      dossiers,
      evidenceMatrices,
      framework,
      manifest,
    )
    console.log(
      `\n[steg 4] Scoring-utkast — ${actorCount} aktør(er), ${scoringRequests.length} kall`,
    )
    const scoringBatchId = await transport!.createBatch(
      scoringRequests,
      'isi-ranking-scoring',
    )
    await recordBatch('isi-ranking-scoring', scoringBatchId)
    await transport!.waitForBatch(scoringBatchId, 'isi-ranking-scoring')
    const scoringResults = await transport!.getBatchResults(scoringBatchId)
    scoreDrafts = parseScoringDraftResults(scoringRequests, scoringResults)
    await writeScoreDrafts(outputDir, scoreDrafts)
    const scoringUsage = sumBatchUsage(scoringResults)
    totalUsage = addUsage(totalUsage, scoringUsage)
    console.log(`[steg 4] Ferdig (${formatUsage(scoringUsage)})`)
  } else {
    console.log(
      `\n[steg 4] Hoppet over (--from-step=${fromStep}) — laster fra disk`,
    )
    scoreDrafts = await loadScoreDrafts(outputDir, dossiers)
  }

  let gapResearchRequestsCount = 0

  if (!skipGapResearch) {
    const gapPlans = buildGapResearchPlans(dossiers, scoreDrafts)
    const gapRequests = buildGapResearchRequests(
      dossiers,
      gapPlans,
      framework,
      manifestKort,
      evidenceArtifacts,
    )
    gapResearchRequestsCount = gapRequests.length

    if (gapRequests.length > 0 || fromStep > 5) {
      if (fromStep <= 5 && gapRequests.length > 0) {
        // Steg 5: Gap-søk
        console.log(
          `\n[steg 5] Gap-søk — ${gapRequests.length} kall for ${actorCount} aktør(er)`,
        )
        const gapBatchId = await transport!.createBatch(
          gapRequests,
          'isi-ranking-gap',
        )
        await recordBatch('isi-ranking-gap', gapBatchId)
        await transport!.waitForBatch(gapBatchId, 'isi-ranking-gap')
        const gapResults = await transport!.getBatchResults(gapBatchId)
        const gapArtifacts = parseGapResearchResults(gapRequests, gapResults)
        evidenceArtifacts = mergeEvidenceArtifacts(
          evidenceArtifacts,
          gapArtifacts,
        )
        await writeEvidenceArtifacts(outputDir, gapArtifacts)
        const gapUsage = sumBatchUsage(gapResults)
        totalUsage = addUsage(totalUsage, gapUsage)
        console.log(`[steg 5] Ferdig (${formatUsage(gapUsage)})`)

        for (const gapPlan of gapPlans) {
          await writeGapResolution(outputDir, gapPlan.actorSlug, gapPlan)
        }
      } else {
        console.log(
          `\n[steg 5] Hoppet over (--from-step=${fromStep}) — laster gap-evidens fra disk`,
        )
        // Gap artifacts were already written to the evidence dir by replay-gap-batch.
        // Re-load all evidence so gap findings are included.
        evidenceArtifacts = await loadEvidenceArtifacts(outputDir, dossiers)
      }

      // Steg 6: Evidensmatrise (oppdatert)
      const refreshedReviewRequests = buildEvidenceReviewRequests(
        dossiers,
        evidenceArtifacts,
        framework,
        manifestKort,
      )
      console.log(
        `\n[steg 6] Evidensmatrise (oppdatert) — ${refreshedReviewRequests.length} kall`,
      )
      const refreshedReviewBatchId = await transport!.createBatch(
        refreshedReviewRequests,
        'isi-ranking-matrix-refresh',
      )
      await recordBatch('isi-ranking-matrix-refresh', refreshedReviewBatchId)
      await transport!.waitForBatch(
        refreshedReviewBatchId,
        'isi-ranking-matrix-refresh',
      )
      const refreshedReviewResults = await transport!.getBatchResults(
        refreshedReviewBatchId,
      )
      evidenceMatrices = parseEvidenceReviewResults(
        refreshedReviewRequests,
        refreshedReviewResults,
      )
      await writeMatrices(outputDir, evidenceMatrices)
      const refreshedReviewUsage = sumBatchUsage(refreshedReviewResults)
      totalUsage = addUsage(totalUsage, refreshedReviewUsage)
      console.log(`[steg 6] Ferdig (${formatUsage(refreshedReviewUsage)})`)

      // Steg 7: Scoring-utkast (oppdatert)
      const refreshedScoringRequests = buildScoringDraftRequests(
        dossiers,
        evidenceMatrices,
        framework,
        manifest,
      )
      console.log(
        `\n[steg 7] Scoring-utkast (oppdatert) — ${refreshedScoringRequests.length} kall`,
      )
      const refreshedScoringBatchId = await transport!.createBatch(
        refreshedScoringRequests,
        'isi-ranking-scoring-refresh',
      )
      await recordBatch('isi-ranking-scoring-refresh', refreshedScoringBatchId)
      await transport!.waitForBatch(
        refreshedScoringBatchId,
        'isi-ranking-scoring-refresh',
      )
      const refreshedScoringResults = await transport!.getBatchResults(
        refreshedScoringBatchId,
      )
      scoreDrafts = parseScoringDraftResults(
        refreshedScoringRequests,
        refreshedScoringResults,
      )
      await writeScoreDrafts(outputDir, scoreDrafts)
      const refreshedScoringUsage = sumBatchUsage(refreshedScoringResults)
      totalUsage = addUsage(totalUsage, refreshedScoringUsage)
      console.log(`[steg 7] Ferdig (${formatUsage(refreshedScoringUsage)})`)
    }
  }

  // Siste steg: Sluttrapporter
  const finalReportRequests = buildFinalReportRequests(
    dossiers,
    evidenceMatrices,
    scoreDrafts,
    evidenceArtifacts,
    framework,
    manifestFull,
    template,
  )
  console.log(
    `\n[steg slutt] Sluttrapporter — ${actorCount} aktør(er), ${finalReportRequests.length} kall`,
  )
  const finalReportBatchId = await transport!.createBatch(
    finalReportRequests,
    'isi-ranking-final-report',
  )
  await recordBatch('isi-ranking-final-report', finalReportBatchId)
  await transport!.waitForBatch(finalReportBatchId, 'isi-ranking-final-report')
  const finalReportResults =
    await transport!.getBatchResults(finalReportBatchId)
  const reports = parseFinalReportResults(
    finalReportRequests,
    finalReportResults,
  )
  await writeReports(outputDir, reports)
  const finalUsage = sumBatchUsage(finalReportResults)
  totalUsage = addUsage(totalUsage, finalUsage)
  console.log(`[steg slutt] Ferdig (${formatUsage(finalUsage)})`)

  console.log(`\n[totalt] ${formatUsage(totalUsage)}`)

  const actorSlugs = dossiers.map((dossier) => dossier.actorSlug)
  const { prUrl } = await publishReports(actorSlugs, outputDir, dryRun)

  return {
    outputDir,
    actorCount: dossiers.length,
    reportsGenerated: reports.size,
    gapResearchRequests: gapResearchRequestsCount,
    prUrl,
  }
}
