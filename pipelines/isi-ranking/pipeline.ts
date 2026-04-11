import path from 'path'
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
import { LiveAnthropicBatchTransport } from './anthropic-batch.ts'
import {
  DEFAULT_ACTOR_FILE,
  DEFAULT_FRAMEWORK_FILE,
  DEFAULT_MANIFEST_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_TEMPLATE_FILE,
} from './constants.ts'
import type {
  ActorInput,
  EvidenceArtifact,
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
} from './utils.ts'

async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
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
    await writeMarkdownFile(path.join(paths.actorDir, 'actor-dossier.md'), dossierMarkdown(dossier))
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
    await writeMarkdownFile(paths.sourcePriorityMarkdown, researchPlanMarkdown(plan))
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
    await writeJsonFile(path.join(paths.evidenceDir, `${fileStem}.json`), artifact)
    await writeMarkdownFile(
      path.join(paths.evidenceDir, `${fileStem}.md`),
      evidenceArtifactMarkdown(artifact),
    )
  }
}

async function writeMatrices(
  outputDir: string,
  matrices: Map<string, any>,
): Promise<void> {
  for (const [actorSlug, matrix] of matrices) {
    const paths = buildPipelinePaths(outputDir, actorSlug)
    await writeJsonFile(paths.evidenceMatrixJson, matrix)
    await writeMarkdownFile(paths.evidenceMatrixMarkdown, evidenceMatrixMarkdown(matrix))
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

async function executeBatchStep<T>(
  transport: LiveAnthropicBatchTransport | RunPipelineOptions['transport'],
  label: string,
  requests: T[],
  outputDir: string,
  dryRunFileName: string,
  run: () => Promise<void>,
): Promise<boolean> {
  if (requests.length === 0) {
    return false
  }

  if (!transport) {
    throw new Error(`Mangler transport for steg ${label}`)
  }

  await run()
  return true
}

export async function runIsiRankingPipeline(
  options: Partial<RunPipelineOptions> = {},
): Promise<RunPipelineSummary> {
  const actorFile = options.actorFile ?? DEFAULT_ACTOR_FILE
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR
  const manifestFile = options.manifestFile ?? DEFAULT_MANIFEST_FILE
  const frameworkFile = options.frameworkFile ?? DEFAULT_FRAMEWORK_FILE
  const templateFile = options.templateFile ?? DEFAULT_TEMPLATE_FILE
  const dryRun = options.dryRun ?? false
  const skipGapResearch = options.skipGapResearch ?? false
  const transport = options.transport ?? (dryRun ? undefined : new LiveAnthropicBatchTransport())

  await ensureDir(outputDir)

  const actors = await readJsonFile<ActorInput[]>(actorFile)
  const _manifest = await readTextFile(manifestFile)
  const framework = await readTextFile(frameworkFile)
  const template = await readTextFile(templateFile)

  const dossiers = await writeDossiers(outputDir, actors)

  const researchPlanRequests = buildResearchPlanRequests(dossiers, framework)
  if (dryRun) {
    await saveDryRunRequests(outputDir, '01_research-plan.requests.json', researchPlanRequests)
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
      ),
    )
    return {
      outputDir,
      actorCount: dossiers.length,
      reportsGenerated: 0,
      gapResearchRequests: 0,
    }
  }

  const researchPlanBatchId = await transport!.createBatch(
    researchPlanRequests,
    'isi-ranking-research-plan',
  )
  await transport!.waitForBatch(researchPlanBatchId, 'isi-ranking-research-plan')
  const researchPlanResults = await transport!.getBatchResults(researchPlanBatchId)
  const researchPlans = parseResearchPlanResults(researchPlanRequests, researchPlanResults)
  await writeResearchPlans(outputDir, researchPlans)

  const evidenceHarvestRequests = buildEvidenceHarvestRequests(
    dossiers,
    researchPlans,
    framework,
  )
  const evidenceBatchId = await transport!.createBatch(
    evidenceHarvestRequests,
    'isi-ranking-evidence',
  )
  await transport!.waitForBatch(evidenceBatchId, 'isi-ranking-evidence')
  const evidenceResults = await transport!.getBatchResults(evidenceBatchId)
  let evidenceArtifacts = parseEvidenceHarvestResults(
    evidenceHarvestRequests,
    evidenceResults,
  )
  await writeEvidenceArtifacts(outputDir, evidenceArtifacts)

  const reviewRequests = buildEvidenceReviewRequests(dossiers, evidenceArtifacts)
  const reviewBatchId = await transport!.createBatch(reviewRequests, 'isi-ranking-matrix')
  await transport!.waitForBatch(reviewBatchId, 'isi-ranking-matrix')
  const reviewResults = await transport!.getBatchResults(reviewBatchId)
  let evidenceMatrices = parseEvidenceReviewResults(reviewRequests, reviewResults)
  await writeMatrices(outputDir, evidenceMatrices)

  const scoringRequests = buildScoringDraftRequests(evidenceMatrices)
  const scoringBatchId = await transport!.createBatch(scoringRequests, 'isi-ranking-scoring')
  await transport!.waitForBatch(scoringBatchId, 'isi-ranking-scoring')
  const scoringResults = await transport!.getBatchResults(scoringBatchId)
  let scoreDrafts = parseScoringDraftResults(scoringRequests, scoringResults)
  await writeScoreDrafts(outputDir, scoreDrafts)

  let gapResearchRequestsCount = 0

  if (!skipGapResearch) {
    const gapPlans = buildGapResearchPlans(dossiers, scoreDrafts)
    const gapRequests = buildGapResearchRequests(dossiers, gapPlans, framework)
    gapResearchRequestsCount = gapRequests.length

    if (gapRequests.length > 0) {
      const gapBatchId = await transport!.createBatch(gapRequests, 'isi-ranking-gap')
      await transport!.waitForBatch(gapBatchId, 'isi-ranking-gap')
      const gapResults = await transport!.getBatchResults(gapBatchId)
      const gapArtifacts = parseGapResearchResults(gapRequests, gapResults)
      evidenceArtifacts = mergeEvidenceArtifacts(evidenceArtifacts, gapArtifacts)
      await writeEvidenceArtifacts(outputDir, gapArtifacts)

      for (const gapPlan of gapPlans) {
        await writeGapResolution(outputDir, gapPlan.actorSlug, gapPlan)
      }

      const refreshedReviewRequests = buildEvidenceReviewRequests(dossiers, evidenceArtifacts)
      const refreshedReviewBatchId = await transport!.createBatch(
        refreshedReviewRequests,
        'isi-ranking-matrix-refresh',
      )
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

      const refreshedScoringRequests = buildScoringDraftRequests(evidenceMatrices)
      const refreshedScoringBatchId = await transport!.createBatch(
        refreshedScoringRequests,
        'isi-ranking-scoring-refresh',
      )
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
    }
  }

  const finalReportRequests = buildFinalReportRequests(
    dossiers,
    evidenceMatrices,
    scoreDrafts,
    framework,
    template,
  )
  const finalReportBatchId = await transport!.createBatch(
    finalReportRequests,
    'isi-ranking-final-report',
  )
  await transport!.waitForBatch(finalReportBatchId, 'isi-ranking-final-report')
  const finalReportResults = await transport!.getBatchResults(finalReportBatchId)
  const reports = parseFinalReportResults(finalReportRequests, finalReportResults)
  await writeReports(outputDir, reports)

  return {
    outputDir,
    actorCount: dossiers.length,
    reportsGenerated: reports.size,
    gapResearchRequests: gapResearchRequestsCount,
  }
}
