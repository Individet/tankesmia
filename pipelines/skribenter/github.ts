import type { Octokit } from '@octokit/rest'
import { createOctokit } from '../utils/octokit.ts'
import { RAW_DATA, WEBSITE } from './constants.ts'
import type { PublishedFile, Publisher } from './types.ts'

interface RepoRef {
  owner: string
  repo: string
}

export const RAW_DATA_REPO: RepoRef = { owner: RAW_DATA.owner, repo: RAW_DATA.repo }

let client: Octokit | undefined
export function octokit(): Octokit {
  client ??= createOctokit()
  return client
}

export function hasGitHubCredentials(): boolean {
  return !!(process.env.GITHUB_TOKEN || process.env.GITHUB_APP_ID)
}

/** Leser en fil fra et repo. Returnerer null hvis den ikke finnes. */
export async function readRemoteFile(
  repo: RepoRef,
  ref: string,
  filePath: string,
): Promise<Buffer | null> {
  try {
    const { data } = await octokit().repos.getContent({ ...repo, path: filePath, ref })
    if (Array.isArray(data) || data.type !== 'file') return null
    if ('content' in data && data.content) return Buffer.from(data.content, 'base64')
    // Filer > 1 MB kommer uten innhold — hent via blob-API.
    const blob = await octokit().git.getBlob({ ...repo, file_sha: data.sha })
    return Buffer.from(blob.data.content, 'base64')
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}

export async function listRemoteDir(repo: RepoRef, ref: string, dirPath: string): Promise<string[]> {
  try {
    const { data } = await octokit().repos.getContent({ ...repo, path: dirPath, ref })
    return Array.isArray(data) ? data.filter((d) => d.type === 'file').map((d) => d.path) : []
  } catch (error) {
    if ((error as { status?: number }).status === 404) return []
    throw error
  }
}

async function treeEntries(repo: RepoRef, files: PublishedFile[]) {
  const gh = octokit()
  return Promise.all(
    files.map(async (file) => {
      if (typeof file.content === 'string') {
        return { path: file.path, mode: '100644' as const, type: 'blob' as const, content: file.content }
      }
      const { data: blob } = await gh.git.createBlob({
        ...repo,
        content: file.content.toString('base64'),
        encoding: 'base64',
      })
      return { path: file.path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha }
    }),
  )
}

/** Lager én commit med mange filer (tekst og binært) oppå `parentSha`. Flytter ingen branch. */
async function createCommitOnto(
  repo: RepoRef,
  parentSha: string,
  tree: Awaited<ReturnType<typeof treeEntries>>,
  message: string,
): Promise<string> {
  const gh = octokit()
  const { data: newTree } = await gh.git.createTree({ ...repo, base_tree: parentSha, tree })
  const { data: commit } = await gh.git.createCommit({
    ...repo,
    message,
    tree: newTree.sha,
    parents: [parentSha],
  })
  return commit.sha
}

/**
 * Én commit med mange filer på en eksisterende branch. Har noen andre pushet
 * til branchen i mellomtiden (422, ikke fast-forward), bygges commiten på nytt
 * oppå den nye toppen — filene våre overskriver bare sine egne stier.
 */
export async function commitFiles(
  repo: RepoRef,
  branch: string,
  files: PublishedFile[],
  message: string,
  maxAttempts = 3,
): Promise<void> {
  if (files.length === 0) return
  const gh = octokit()
  const tree = await treeEntries(repo, files)
  for (let attempt = 1; ; attempt++) {
    const { data: ref } = await gh.git.getRef({ ...repo, ref: `heads/${branch}` })
    const sha = await createCommitOnto(repo, ref.object.sha, tree, message)
    try {
      await gh.git.updateRef({ ...repo, ref: `heads/${branch}`, sha })
      return
    } catch (error) {
      if ((error as { status?: number }).status !== 422 || attempt >= maxAttempts) throw error
      console.warn(`[github] ${repo.owner}/${repo.repo}@${branch} flyttet seg under commit — prøver igjen (${attempt}/${maxAttempts})`)
    }
  }
}

/**
 * Sjekker før vi bruker penger på LLM-kall at vi faktisk når begge repoene
 * (typisk feil: GitHub-appen er ikke installert på r-data eller nettsiden).
 */
export async function verifyRepoAccess(): Promise<void> {
  const targets: Array<RepoRef & { branch: string }> = [
    { ...RAW_DATA_REPO, branch: RAW_DATA.branch },
    { owner: WEBSITE.owner, repo: WEBSITE.repo, branch: WEBSITE.baseBranch },
  ]
  const errors: string[] = []
  for (const target of targets) {
    try {
      await octokit().repos.getBranch({ owner: target.owner, repo: target.repo, branch: target.branch })
    } catch (error) {
      const status = (error as { status?: number }).status
      errors.push(
        `${target.owner}/${target.repo}@${target.branch}: ${status ?? ''} ${error instanceof Error ? error.message : error}`.trim(),
      )
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `Mangler tilgang til repo — sjekk at GitHub-appen er installert og har contents/pull-requests-skrivetilgang:\n  • ${errors.join('\n  • ')}`,
    )
  }
  console.log('[verify-auth] Tilgang til r-data og nettsiden OK')
}

function sameContent(remote: Buffer | null, local: string | Buffer): boolean {
  if (!remote) return false
  const localBuf = typeof local === 'string' ? Buffer.from(local, 'utf8') : local
  return remote.equals(localBuf)
}

/** Fast branch for skribent-PR-en. Den tilbakestilles til `main` + endringene hver kjøring. */
export const WEBSITE_PR_BRANCH = 'skribenter/oppdatering'

/**
 * Publiserer endrede sider som én PR mot nettsiden. Filer som er identiske med
 * det som allerede ligger på main filtreres bort; er ingenting endret, lages
 * ingen PR.
 *
 * Det finnes bare én skribent-PR om gangen: branchen `skribenter/oppdatering`
 * bygges på nytt fra `main` hver kjøring (force-push), og en åpen PR fra den
 * oppdateres i stedet for at det lages en ny. En PR som ikke er flettet ennå,
 * blir altså bare mer komplett — det hoper seg ikke opp PR-er. Ikke gjør
 * manuelle endringer på den branchen; de overskrives neste kjøring.
 */
export class WebsitePublisher implements Publisher {
  async publish(files: PublishedFile[], summary: string, problems = ''): Promise<{ prUrl?: string }> {
    const repo = { owner: WEBSITE.owner, repo: WEBSITE.repo }
    const changed: PublishedFile[] = []
    for (const file of files) {
      const remote = await readRemoteFile(repo, WEBSITE.baseBranch, file.path)
      if (!sameContent(remote, file.content)) changed.push(file)
    }

    const gh = octokit()
    const { data: openPrs } = await gh.pulls.list({
      ...repo,
      state: 'open',
      head: `${WEBSITE.owner}:${WEBSITE_PR_BRANCH}`,
      base: WEBSITE.baseBranch,
    })
    const existing = openPrs[0]

    if (changed.length === 0) {
      console.log('[publish] Ingen endringer mot nettsiden — hopper over PR.')
      if (existing) {
        console.log(`[publish] Åpen PR ${existing.html_url} har ingenting nytt mot main og kan lukkes.`)
      }
      return {}
    }

    const { data: base } = await gh.repos.getBranch({ ...repo, branch: WEBSITE.baseBranch })
    const tree = await treeEntries(repo, changed)
    const commitSha = await createCommitOnto(repo, base.commit.sha, tree, 'feat(skribenter): oppdater skribentprofiler')
    try {
      await gh.git.updateRef({ ...repo, ref: `heads/${WEBSITE_PR_BRANCH}`, sha: commitSha, force: true })
    } catch (error) {
      if ((error as { status?: number }).status !== 422) throw error
      await gh.git.createRef({ ...repo, ref: `refs/heads/${WEBSITE_PR_BRANCH}`, sha: commitSha })
    }

    const title = `Skribentprofiler: ${changed.length} endrede filer`
    const body = [
      'Automatisk generert av skribent-pipelinen i Individet/tankesmia.',
      'PR-en oppdateres automatisk ved hver kjøring til den er flettet.',
      '',
      '### Beslutninger siste kjøring',
      '',
      summary,
      '',
      '### Problemer siste kjøring',
      '',
      problems || '✅ Ingen problemer.',
      '',
      '### Endrede filer mot main',
      ...changed.map((f) => `- \`${f.path}\``),
    ].join('\n')

    if (existing) {
      await gh.pulls.update({ ...repo, pull_number: existing.number, title, body })
      console.log(`[publish] Oppdaterte PR: ${existing.html_url}`)
      return { prUrl: existing.html_url }
    }
    const { data: pr } = await gh.pulls.create({
      ...repo,
      head: WEBSITE_PR_BRANCH,
      base: WEBSITE.baseBranch,
      title,
      body,
    })
    console.log(`[publish] Opprettet PR: ${pr.html_url}`)
    return { prUrl: pr.html_url }
  }
}
