import {
  DEFAULT_ACTOR_FILE,
  DEFAULT_FRAMEWORK_FILE,
  DEFAULT_MANIFEST_FILE,
  DEFAULT_MANIFEST_FULL_FILE,
  DEFAULT_MANIFEST_KORT_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_TEMPLATE_FILE,
} from './constants.ts'
import { runIsiRankingPipeline } from './pipeline.ts'
import type { ActorInput } from './types.ts'

function readActorFromEnv(): ActorInput | null {
  const name = process.env.ISI_NAME
  const type = process.env.ISI_TYPE
  if (!name || !type) return null

  const actor: ActorInput = { name, type }

  const parti = process.env.ISI_PARTI
  if (parti) actor.parti = parti

  const tilhørighet = process.env.ISI_TILHORIGHET
  if (tilhørighet) actor.tilhørighet = tilhørighet

  const jurisdiksjon = process.env.ISI_JURISDIKSJON
  if (jurisdiksjon) actor.jurisdiksjon = jurisdiksjon

  const periode = process.env.ISI_PERIODE
  if (periode) actor.periode = periode

  const beskrivelse = process.env.ISI_BESKRIVELSE
  if (beskrivelse) actor.beskrivelse = beskrivelse

  return actor
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  // npm intercepter --from-step=N som npm-konfig og sender den ikke videre til scriptet.
  // Bruk env-variabel som primær kilde: FROM_STEP=3 npm run isi-ranking
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
    skipGapResearch: args.includes('--skip-gap-research'),
    fromStep,
    actorFile: args.find((arg) => !arg.startsWith('-')) ?? DEFAULT_ACTOR_FILE,
    outputDir:
      args.find((arg) => arg.startsWith('--output-dir='))?.split('=')[1] ??
      DEFAULT_OUTPUT_DIR,
    manifestFile: DEFAULT_MANIFEST_FILE,
    manifestKortFile: DEFAULT_MANIFEST_KORT_FILE,
    manifestFullFile: DEFAULT_MANIFEST_FULL_FILE,
    frameworkFile: DEFAULT_FRAMEWORK_FILE,
    templateFile: DEFAULT_TEMPLATE_FILE,
  }
}

async function main() {
  const options = parseArgs(process.argv)
  const envActor = readActorFromEnv()

  if (envActor) {
    console.log(`[isi-ranking] Bruker aktør fra miljøvariabler: ${envActor.name}`)
  }

  const summary = await runIsiRankingPipeline({
    ...options,
    ...(envActor ? { envActors: [envActor] } : {}),
  })
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
