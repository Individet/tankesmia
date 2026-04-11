import {
  DEFAULT_ACTOR_FILE,
  DEFAULT_FRAMEWORK_FILE,
  DEFAULT_MANIFEST_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_TEMPLATE_FILE,
} from './constants.ts'
import { runIsiRankingPipeline } from './pipeline.ts'

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  return {
    dryRun: args.includes('--dry-run'),
    skipGapResearch: args.includes('--skip-gap-research'),
    actorFile: args.find((arg) => !arg.startsWith('-')) ?? DEFAULT_ACTOR_FILE,
    outputDir:
      args.find((arg) => arg.startsWith('--output-dir='))?.split('=')[1] ??
      DEFAULT_OUTPUT_DIR,
    manifestFile: DEFAULT_MANIFEST_FILE,
    frameworkFile: DEFAULT_FRAMEWORK_FILE,
    templateFile: DEFAULT_TEMPLATE_FILE,
  }
}

async function main() {
  const options = parseArgs(process.argv)
  const summary = await runIsiRankingPipeline(options)
  console.log('\n=== Pipeline ferdig ===')
  console.log(`Aktører behandlet : ${summary.actorCount}`)
  console.log(`Rapporter generert: ${summary.reportsGenerated}`)
  if (summary.gapResearchRequests > 0) {
    console.log(`Gap-søk utført    : ${summary.gapResearchRequests}`)
  }
  console.log(`Utdata            : ${summary.outputDir}`)
  if (summary.prUrl) {
    console.log(`Pull request      : ${summary.prUrl}`)
  }
}

main().catch((error) => {
  console.error('Isi-ranking pipeline feilet:')
  console.error(error)
  process.exit(1)
})
