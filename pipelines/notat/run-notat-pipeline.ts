import {
  DEFAULT_FORMAT_FILE,
  DEFAULT_INPUT_FILE,
  DEFAULT_MANIFEST_FILE,
  DEFAULT_MANIFEST_FULL_FILE,
  DEFAULT_MANIFEST_KORT_FILE,
  DEFAULT_OUTPUT_DIR,
} from './constants.ts'
import { runNotatPipeline } from './pipeline.ts'

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const fromStepArg = args.find((arg) => arg.startsWith('--from-step='))
  const fromStepRaw = fromStepArg?.split('=')[1] ?? process.env.FROM_STEP

  let fromStep: number | undefined
  if (fromStepRaw) {
    const n = parseInt(fromStepRaw, 10)
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(
        `Ugyldig --from-step/FROM_STEP-verdi: "${fromStepRaw}". Må være et heltall ≥ 1.`,
      )
    }
    fromStep = n
  }

  return {
    dryRun: args.includes('--dry-run'),
    fromStep,
    inputFile: args.find((arg) => !arg.startsWith('-')) ?? DEFAULT_INPUT_FILE,
    outputDir:
      args.find((arg) => arg.startsWith('--output-dir='))?.split('=')[1] ??
      DEFAULT_OUTPUT_DIR,
    manifestFile: DEFAULT_MANIFEST_FILE,
    manifestKortFile: DEFAULT_MANIFEST_KORT_FILE,
    manifestFullFile: DEFAULT_MANIFEST_FULL_FILE,
    formatFile: DEFAULT_FORMAT_FILE,
  }
}

async function main() {
  const options = parseArgs(process.argv)
  const summary = await runNotatPipeline(options)
  console.log('\n=== Pipeline ferdig ===')
  console.log(`Notat slug     : ${summary.notatSlug}`)
  console.log(`Steg fullført  : ${summary.stepsCompleted}`)
  console.log(`Utdata         : ${summary.outputDir}`)
  if (summary.prUrl) {
    console.log(`Pull request   : ${summary.prUrl}`)
  }
}

main().catch((error) => {
  console.error('Notat-pipeline feilet:')
  console.error(error)
  process.exit(1)
})
