import { assertAuth, verifyAuth } from '../notat/00_verify-auth.ts'
import { LiveAnthropicBatchTransport } from '../notat/anthropic-batch.ts'
import {
  DEFAULT_MANIFEST_FILE,
  DEFAULT_MANIFEST_KORT_FILE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_REGISTRY_FILE,
  DEFAULT_STYLE_FILE,
} from './constants.ts'
import { WebsitePublisher, hasGitHubCredentials, verifyRepoAccess } from './github.ts'
import { runSkribenterPipeline } from './pipeline.ts'
import { GitHubWriterStore, LocalWriterStore } from './store.ts'
import path from 'path'
import type { RunProblem } from './types.ts'

/** I GitHub Actions blir disse til røde/gule annotasjoner øverst i kjøringen. */
function annotate(problem: RunProblem) {
  if (!process.env.GITHUB_ACTIONS) return
  const title = `skribenter/${problem.step}${problem.writerId ? ` ${problem.writerId}` : ''}`
  const message = problem.message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
  console.log(`::${problem.severity} title=${title}::${message}`)
}

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
      await verifyRepoAccess()
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

  for (const problem of summary.problems) annotate(problem)
  const errors = summary.problems.filter((p) => p.severity === 'error')
  const warnings = summary.problems.length - errors.length
  console.log(`Problemer      : ${errors.length} feil, ${warnings} advarsler (se run-report.md)`)
  // Tilstand og sider er lagret, men en rød kjøring gjør at feil blir lagt merke til.
  if (errors.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('Skribent-pipeline feilet:')
  console.error(error)
  process.exit(1)
})
