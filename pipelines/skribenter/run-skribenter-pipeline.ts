import { assertAuth, verifyAuth } from '../notat/00_verify-auth.ts'
import { LiveAnthropicBatchTransport } from '../notat/anthropic-batch.ts'
import {
  DEFAULT_MANIFEST_FILE,
  DEFAULT_MANIFEST_KORT_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_REGISTRY_FILE,
  DEFAULT_STYLE_FILE,
} from './constants.ts'
import { WebsitePublisher, hasGitHubCredentials } from './github.ts'
import { runSkribenterPipeline } from './pipeline.ts'
import { GitHubWriterStore, LocalWriterStore } from './store.ts'
import path from 'path'

function listArg(args: string[], name: string, envName: string): string[] | undefined {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? process.env[envName]
  const list = raw?.split(',').map((s) => s.trim()).filter(Boolean)
  return list?.length ? list : undefined
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const local = args.includes('--local')
  const forceAll = args.includes('--force') || process.env.SKRIBENTER_FORCE === 'all'
  const forceIds = listArg(args, 'force', 'SKRIBENTER_FORCE')?.filter((id) => id !== 'all')
  const only = listArg(args, 'only', 'SKRIBENTER_ONLY')
  const outputDir =
    args.find((a) => a.startsWith('--output-dir='))?.split('=')[1] ?? DEFAULT_OUTPUT_DIR
  const registryFile = args.find((a) => !a.startsWith('-')) ?? DEFAULT_REGISTRY_FILE

  const useGitHub = !local && hasGitHubCredentials()
  if (!dryRun) {
    if (useGitHub) {
      assertAuth(await verifyAuth())
    } else if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY mangler.')
    }
  }

  const localStateDir = path.join(outputDir, 'state')
  const store = useGitHub ? new GitHubWriterStore(localStateDir) : new LocalWriterStore(localStateDir)
  console.log(
    `[skribenter] Tilstand: ${useGitHub ? 'Individet/r-data (+ lokal kopi)' : localStateDir}` +
      `${dryRun ? ' — DRY RUN' : ''}`,
  )

  const summary = await runSkribenterPipeline({
    registryFile,
    outputDir,
    manifestFile: DEFAULT_MANIFEST_FILE,
    manifestKortFile: DEFAULT_MANIFEST_KORT_FILE,
    styleFile: DEFAULT_STYLE_FILE,
    dryRun,
    force: forceAll ? true : forceIds,
    only,
    store,
    transport: dryRun ? undefined : new LiveAnthropicBatchTransport(),
    publisher: useGitHub && !dryRun ? new WebsitePublisher() : null,
  })

  const count = (action: string) => summary.decisions.filter((d) => d.action === action).length
  console.log('\n=== Pipeline ferdig ===')
  console.log(`Ny profil      : ${count('full')}`)
  console.log(`Nye tekster    : ${count('update-list')}`)
  console.log(`Uendret        : ${count('skip')}`)
  if (summary.prUrl) console.log(`Pull request   : ${summary.prUrl}`)
}

main().catch((error) => {
  console.error('Skribent-pipeline feilet:')
  console.error(error)
  process.exit(1)
})
