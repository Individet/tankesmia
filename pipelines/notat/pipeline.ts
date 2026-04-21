import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { promises as fs } from 'fs'
import {
  buildResearchPlanRequest,
  parseResearchPlanResult,
  researchPlanMarkdown,
} from './01_research-plan.ts'
import {
  buildEvidenceHarvestRequests,
  evidenceArtifactMarkdown,
  parseEvidenceHarvestResults,
} from './02_evidence-harvest.ts'
import {
  buildWriteNotatRequest,
  parseWriteNotatResult,
} from './03_write-notat.ts'
import { publishNotat } from './04_github-publish.ts'
import { assertAuth, verifyAuth } from './00_verify-auth.ts'
import { LiveAnthropicBatchTransport } from './anthropic-batch.ts'
import {
  DEFAULT_FORMAT_FILE,
  DEFAULT_INPUT_FILE,
  DEFAULT_MANIFEST_FILE,
  DEFAULT_MANIFEST_FULL_FILE,
  DEFAULT_MANIFEST_KORT_FILE,
  DEFAULT_OUTPUT_DIR,
} from './constants.ts'
import type {
  NotatEvidenceArtifact,
  NotatInput,
  NotatResearchPlan,
  RunNotatPipelineOptions,
  RunNotatPipelineSummary,
} from './types.ts'
import {
  addUsage,
  emptyUsage,
  ensureDir,
  formatUsage,
  readJsonFile,
  slug,
  sumBatchUsage,
  writeJsonFile,
  writeMarkdownFile,
} from './utils.ts'

async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

async function loadFromDisk<T>(filePath: string, stepName: string): Promise<T> {
  try {
    return await readJsonFile<T>(filePath)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `--from-step: Mangler forventet fil fra ${stepName}: ${filePath}\n` +
          `Kjør pipelinen fra et tidligere steg for å generere filen.`,
      )
    }
    throw err
  }
}

function deriveNotatSlug(input: NotatInput): string {
  return slug(input.tema)
}

function buildOutputPaths(outputDir: string, notatSlug: string) {
  const notatDir = path.join(outputDir, notatSlug)
  return {
    notatDir,
    inputJson: path.join(notatDir, 'notat-input.json'),
    researchPlanJson: path.join(notatDir, 'research-plan.json'),
    researchPlanMarkdown: path.join(notatDir, 'research-plan.md'),
    evidenceDir: path.join(notatDir, 'evidence'),
    notatMarkdown: path.join(notatDir, 'notat.md'),
    pipelineState: path.join(notatDir, 'pipeline-state.json'),
  }
}

async function saveDryRunRequests(
  outputDir: string,
  fileName: string,
  requests: unknown[],
): Promise<void> {
  await writeJsonFile(path.join(outputDir, fileName), requests)
}

export async function runNotatPipeline(
  options: Partial<RunNotatPipelineOptions> = {},
): Promise<RunNotatPipelineSummary> {
  const inputFile = options.inputFile ?? DEFAULT_INPUT_FILE
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR
  const manifestFile = options.manifestFile ?? DEFAULT_MANIFEST_FILE
  const manifestKortFile =
    options.manifestKortFile ?? DEFAULT_MANIFEST_KORT_FILE
  const manifestFullFile =
    options.manifestFullFile ?? DEFAULT_MANIFEST_FULL_FILE
  const formatFile = options.formatFile ?? DEFAULT_FORMAT_FILE
  const dryRun = options.dryRun ?? false
  const fromStep = options.fromStep ?? 1
  const transport =
    options.transport ??
    (dryRun ? undefined : new LiveAnthropicBatchTransport())

  await ensureDir(outputDir)

  if (!dryRun && !options.transport) {
    const authResult = await verifyAuth()
    assertAuth(authResult)
  }

  const input = await readJsonFile<NotatInput>(inputFile)
  const manifest = await readTextFile(manifestFile)
  const manifestKort = await readTextFile(manifestKortFile)
  const manifestFull = await readTextFile(manifestFullFile)
  const formatGuide = await readTextFile(formatFile)

  const notatSlug = deriveNotatSlug(input)
  const paths = buildOutputPaths(outputDir, notatSlug)

  await ensureDir(paths.notatDir)
  await writeJsonFile(paths.inputJson, input)

  const stateFile = paths.pipelineState
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

  // Dry-run: write request payloads and exit
  if (dryRun) {
    const planRequest = buildResearchPlanRequest(
      input,
      notatSlug,
      manifest,
      formatGuide,
    )
    await saveDryRunRequests(paths.notatDir, '01_research-plan.requests.json', [
      planRequest,
    ])
    return {
      outputDir,
      notatSlug,
      stepsCompleted: 0,
    }
  }

  let totalUsage = emptyUsage()
  let stepsCompleted = 0

  // Steg 1: Forskningsplan (Sonnet)
  let researchPlan: NotatResearchPlan
  if (fromStep <= 1) {
    const planRequest = buildResearchPlanRequest(
      input,
      notatSlug,
      manifest,
      formatGuide,
    )
    console.log(`\n[steg 1] Forskningsplan (${planRequest.params.model}) — 1 kall`)
    const planBatchId = await transport!.createBatch([planRequest], 'notat-research-plan')
    await recordBatch('notat-research-plan', planBatchId)
    await transport!.waitForBatch(planBatchId, 'notat-research-plan')
    const planResults = await transport!.getBatchResults(planBatchId)
    researchPlan = parseResearchPlanResult(planRequest, planResults, notatSlug)
    await writeJsonFile(paths.researchPlanJson, researchPlan)
    await writeMarkdownFile(paths.researchPlanMarkdown, researchPlanMarkdown(researchPlan))
    const planUsage = sumBatchUsage(planResults)
    totalUsage = addUsage(totalUsage, planUsage)
    stepsCompleted = 1
    console.log(`[steg 1] Ferdig — ${researchPlan.researchAreas.length} forskningsområder (${formatUsage(planUsage)})`)
  } else {
    console.log(
      `\n[steg 1] Hoppet over (--from-step=${fromStep}) — laster fra disk`,
    )
    researchPlan = await loadFromDisk<NotatResearchPlan>(
      paths.researchPlanJson,
      'steg 1',
    )
  }

  // Steg 2: Evidensinnsamling (Haiku)
  let evidenceArtifacts: Map<string, NotatEvidenceArtifact>
  if (fromStep <= 2) {
    const evidenceRequests = buildEvidenceHarvestRequests(
      researchPlan,
      manifestKort,
    )
    console.log(
      `\n[steg 2] Evidensinnsamling (${evidenceRequests[0]?.params.model ?? 'haiku'}) — ${evidenceRequests.length} kall`,
    )
    const evidenceBatchId = await transport!.createBatch(
      evidenceRequests,
      'notat-evidence',
    )
    await recordBatch('notat-evidence', evidenceBatchId)
    await transport!.waitForBatch(evidenceBatchId, 'notat-evidence')
    const evidenceResults = await transport!.getBatchResults(evidenceBatchId)
    evidenceArtifacts = parseEvidenceHarvestResults(
      evidenceRequests,
      evidenceResults,
    )

    await ensureDir(paths.evidenceDir)
    for (const [areaId, artifact] of evidenceArtifacts) {
      await writeJsonFile(
        path.join(paths.evidenceDir, `${areaId}.json`),
        artifact,
      )
      await writeMarkdownFile(
        path.join(paths.evidenceDir, `${areaId}.md`),
        evidenceArtifactMarkdown(artifact),
      )
    }

    const evidenceUsage = sumBatchUsage(evidenceResults)
    totalUsage = addUsage(totalUsage, evidenceUsage)
    stepsCompleted = 2
    console.log(`[steg 2] Ferdig (${formatUsage(evidenceUsage)})`)
  } else {
    console.log(
      `\n[steg 2] Hoppet over (--from-step=${fromStep}) — laster fra disk`,
    )
    evidenceArtifacts = new Map()
    for (const area of researchPlan.researchAreas) {
      const artifactPath = path.join(paths.evidenceDir, `${area.id}.json`)
      const artifact = await loadFromDisk<NotatEvidenceArtifact>(
        artifactPath,
        'steg 2',
      )
      evidenceArtifacts.set(area.id, artifact)
    }
  }

  // Steg 3: Skriv notat (Opus)
  let notatMarkdown: string
  if (fromStep <= 3) {
    const allEvidence = Array.from(evidenceArtifacts.values())
    const writeRequest = buildWriteNotatRequest(
      input,
      researchPlan,
      allEvidence,
      notatSlug,
      manifestFull,
      formatGuide,
    )
    console.log(`\n[steg 3] Skriv notat (${writeRequest.params.model}) — 1 kall`)
    const writeBatchId = await transport!.createBatch(
      [writeRequest],
      'notat-write',
    )
    await recordBatch('notat-write', writeBatchId)
    await transport!.waitForBatch(writeBatchId, 'notat-write')
    const writeResults = await transport!.getBatchResults(writeBatchId)
    notatMarkdown = parseWriteNotatResult(writeRequest, writeResults)
    await writeMarkdownFile(paths.notatMarkdown, notatMarkdown)
    const writeUsage = sumBatchUsage(writeResults)
    totalUsage = addUsage(totalUsage, writeUsage)
    stepsCompleted = 3
    console.log(`[steg 3] Ferdig (${formatUsage(writeUsage)})`)
  } else {
    console.log(
      `\n[steg 3] Hoppet over (--from-step=${fromStep}) — laster fra disk`,
    )
    notatMarkdown = await fs.readFile(paths.notatMarkdown, 'utf8')
  }

  console.log(`\n[totalt] ${formatUsage(totalUsage)}`)

  const { prUrl } = await publishNotat(
    notatSlug,
    notatMarkdown,
    paths.notatDir,
    dryRun,
  )

  return {
    outputDir,
    notatSlug,
    stepsCompleted,
    prUrl,
  }
}
