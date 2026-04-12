/**
 * replay-evidence-batch.ts
 *
 * Leser en ferdig-kjørt batch-JSON-fil (produsert av dump-batch.ts eller lagret av pipelinen)
 * og skriver evidence-artifact-filene til disk — uten å kalle Anthropic på nytt.
 *
 * Bruk:
 *   npx tsx pipelines/isi-ranking/replay-evidence-batch.ts <batch-json-fil> [--output-dir=...]
 *
 * Eksempel:
 *   npx tsx pipelines/isi-ranking/replay-evidence-batch.ts msgbatch_0144zsaZLPBRPFhA5d3RTmdS.json
 */
import path from 'path'
import { promises as fs } from 'fs'
import { buildEvidenceHarvestRequests, parseEvidenceHarvestResults, evidenceArtifactMarkdown } from './02_evidence-harvest.ts'
import { DEFAULT_MANIFEST_KORT_FILE, DEFAULT_FRAMEWORK_FILE, DEFAULT_OUTPUT_DIR } from './constants.ts'
import type { ActorDossier, ResearchPlan } from './types.ts'
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
  const outputDir = args.find((arg) => arg.startsWith('--output-dir='))?.split('=')[1] ?? DEFAULT_OUTPUT_DIR
  if (!batchFile) {
    console.error('Bruk: npx tsx pipelines/isi-ranking/replay-evidence-batch.ts <batch-json-fil> [--output-dir=...]')
    process.exit(1)
  }
  return { batchFile: batchFile!, outputDir }
}

function batchFileToResultsMap(batchJson: { results: Record<string, any> }): Map<string, any> {
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
      },
      content: (msg.content ?? []).map((block: any) =>
        block.type === 'text' ? { type: 'text' as const, text: block.text } : block,
      ),
    })
  }
  return map
}

async function main() {
  const { batchFile, outputDir } = parseArgs(process.argv)

  console.log(`Leser batch-fil: ${batchFile}`)
  const batchJson = await readJsonFile<{ batch: any; results: Record<string, any> }>(batchFile)
  const resultsMap = batchFileToResultsMap(batchJson)
  console.log(`${resultsMap.size} resultater lastet`)

  // Les actorSlugs og research plans fra output-mappa (steg 1 ma vaere ferdig)
  const actorDirs = (await fs.readdir(outputDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  const researchPlans = new Map<string, ResearchPlan>()
  const dossiers: ActorDossier[] = []

  for (const dir of actorDirs) {
    const planPath = path.join(outputDir, dir, 'research-plan.json')
    try {
      const plan = await readJsonFile<ResearchPlan>(planPath)
      researchPlans.set(plan.actorSlug, plan)
      const dossierPath = path.join(outputDir, dir, 'actor-dossier.json')
      const dossier = await readJsonFile<ActorDossier>(dossierPath)
      dossiers.push(dossier)
    } catch {
      console.warn(`Advarsel: Fant ikke research-plan i ${dir} - hopper over`)
    }
  }

  console.log(`Aktorer: ${dossiers.map((d) => d.actorSlug).join(', ')}`)

  const framework = await fs.readFile(DEFAULT_FRAMEWORK_FILE, 'utf8')
  const manifestKort = await fs.readFile(DEFAULT_MANIFEST_KORT_FILE, 'utf8')

  const requests = buildEvidenceHarvestRequests(dossiers, researchPlans, framework, manifestKort)
  const artifacts = parseEvidenceHarvestResults(requests, resultsMap)
  console.log(`${artifacts.size} artifacts parsert`)

  let written = 0
  for (const [key, artifact] of artifacts) {
    const [actorSlug, subdimensionId] = key.split(':')
    const paths = buildPipelinePaths(outputDir, actorSlug)
    await ensureDir(paths.evidenceDir)
    const fileStem = subdimensionFileStem(subdimensionId)
    await writeJsonFile(path.join(paths.evidenceDir, `${fileStem}.json`), artifact)
    await writeMarkdownFile(path.join(paths.evidenceDir, `${fileStem}.md`), evidenceArtifactMarkdown(artifact))
    written++
  }

  console.log(`\nFerdig - ${written} evidence-filer skrevet til ${outputDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
