/**
 * replay-gap-batch.ts
 *
 * Leser en ferdig-kjørt gap-batch-JSON-fil (produsert av dump-batch.ts eller
 * lagret av pipelinen) og skriver gap-evidence-artifact-filene til disk —
 * uten å kalle Anthropic på nytt.
 *
 * Bruk:
 *   npx tsx pipelines/isi-ranking/replay-gap-batch.ts <batch-json-fil> [--output-dir=...]
 *
 * Eksempel:
 *   npx tsx pipelines/isi-ranking/replay-gap-batch.ts msgbatch_015DSmMHwp1NXGGZkvDg2Wc5.json
 */
import path from 'path'
import { promises as fs } from 'fs'
import {
  buildGapResearchPlans,
  buildGapResearchRequests,
  mergeEvidenceArtifacts,
  parseGapResearchResults,
} from './05_gap-research.ts'
import { evidenceArtifactMarkdown } from './02_evidence-harvest.ts'
import {
  DEFAULT_FRAMEWORK_FILE,
  DEFAULT_MANIFEST_KORT_FILE,
  DEFAULT_OUTPUT_DIR,
  SUBDIMENSIONS,
} from './constants.ts'
import type { ActorDossier, EvidenceArtifact, ScoreDraft } from './types.ts'
import {
  buildPipelinePaths,
  ensureDir,
  readJsonFile,
  subdimensionFileStem,
  writeJsonFile,
  writeMarkdownFile,
} from './utils.ts'

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const batchFile = args.find((arg) => !arg.startsWith('-'))
  const outputDir =
    args.find((arg) => arg.startsWith('--output-dir='))?.split('=')[1] ??
    DEFAULT_OUTPUT_DIR
  if (!batchFile) {
    console.error(
      'Bruk: npx tsx pipelines/isi-ranking/replay-gap-batch.ts <batch-json-fil> [--output-dir=...]',
    )
    process.exit(1)
  }
  return { batchFile: batchFile!, outputDir }
}

function batchFileToResultsMap(batchJson: {
  results: Record<string, any>
}): Map<string, any> {
  const map = new Map<string, any>()
  for (const [customId, raw] of Object.entries(batchJson.results)) {
    const msg = raw?.result?.message
    if (!msg) continue
    map.set(customId, {
      type: 'succeeded',
      model: msg.model,
      stopReason: msg.stop_reason,
      usage: {
        inputTokens: msg.usage?.input_tokens ?? 0,
        outputTokens: msg.usage?.output_tokens ?? 0,
        cacheReadTokens: msg.usage?.cache_read_input_tokens ?? 0,
        cacheCreationTokens: msg.usage?.cache_creation_input_tokens ?? 0,
        webSearchRequests: msg.usage?.server_tool_use?.web_search_requests ?? 0,
      },
      content: (msg.content ?? []).map((block: any) =>
        block.type === 'text'
          ? { type: 'text' as const, text: block.text }
          : block,
      ),
    })
  }
  return map
}

async function loadDossiers(outputDir: string): Promise<ActorDossier[]> {
  const entries = await fs.readdir(outputDir, { withFileTypes: true })
  const dossiers: ActorDossier[] = []
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const dossierPath = path.join(outputDir, entry.name, 'actor-dossier.json')
    try {
      dossiers.push(await readJsonFile<ActorDossier>(dossierPath))
    } catch {
      console.warn(
        `Advarsel: Fant ikke actor-dossier i ${entry.name} – hopper over`,
      )
    }
  }
  return dossiers
}

async function loadScoreDrafts(
  outputDir: string,
  dossiers: ActorDossier[],
): Promise<Map<string, ScoreDraft>> {
  const drafts = new Map<string, ScoreDraft>()
  for (const dossier of dossiers) {
    const paths = buildPipelinePaths(outputDir, dossier.actorSlug)
    try {
      drafts.set(
        dossier.actorSlug,
        await readJsonFile<ScoreDraft>(paths.scoreDraftJson),
      )
    } catch {
      console.warn(
        `Advarsel: Fant ikke score-draft for ${dossier.actorSlug} – hopper over`,
      )
    }
  }
  return drafts
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
      try {
        const artifact = await readJsonFile<EvidenceArtifact>(filePath)
        artifacts.set(`${dossier.actorSlug}:${subdimension.id}`, artifact)
      } catch {
        // Missing evidence files are fine — gap research may fill them.
      }
    }
  }
  return artifacts
}

async function main() {
  const { batchFile, outputDir } = parseArgs(process.argv)

  console.log(`Leser batch-fil: ${batchFile}`)
  const batchJson = await readJsonFile<{
    batch: any
    results: Record<string, any>
  }>(batchFile)
  const resultsMap = batchFileToResultsMap(batchJson)
  console.log(`${resultsMap.size} resultater lastet`)

  const dossiers = await loadDossiers(outputDir)
  console.log(`Aktører: ${dossiers.map((d) => d.actorSlug).join(', ')}`)

  const scoreDrafts = await loadScoreDrafts(outputDir, dossiers)
  const baseArtifacts = await loadEvidenceArtifacts(outputDir, dossiers)

  const framework = await fs.readFile(DEFAULT_FRAMEWORK_FILE, 'utf8')
  const manifestKort = await fs.readFile(DEFAULT_MANIFEST_KORT_FILE, 'utf8')

  const gapPlans = buildGapResearchPlans(dossiers, scoreDrafts)
  const gapRequests = buildGapResearchRequests(
    dossiers,
    gapPlans,
    framework,
    manifestKort,
    baseArtifacts,
  )
  console.log(`${gapRequests.length} gap-requests rekonstruert`)

  const gapArtifacts = parseGapResearchResults(gapRequests, resultsMap)
  console.log(`${gapArtifacts.size} gap-artifacts parsert`)

  const merged = mergeEvidenceArtifacts(baseArtifacts, gapArtifacts)

  let written = 0
  for (const [key, artifact] of gapArtifacts) {
    const [actorSlug, subdimensionId] = key.split(':')
    const paths = buildPipelinePaths(outputDir, actorSlug)
    await ensureDir(paths.evidenceDir)
    const fileStem = subdimensionFileStem(subdimensionId)
    const mergedArtifact = merged.get(key) ?? artifact
    await writeJsonFile(
      path.join(paths.evidenceDir, `${fileStem}.json`),
      mergedArtifact,
    )
    await writeMarkdownFile(
      path.join(paths.evidenceDir, `${fileStem}.md`),
      evidenceArtifactMarkdown(mergedArtifact),
    )
    written++
  }

  for (const gapPlan of gapPlans) {
    const paths = buildPipelinePaths(outputDir, gapPlan.actorSlug)
    await writeJsonFile(paths.gapResolutionJson, gapPlan)
  }

  console.log(
    `\nFerdig — ${written} gap-evidence-filer skrevet til ${outputDir}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
