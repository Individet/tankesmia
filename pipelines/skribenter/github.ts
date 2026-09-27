import type { Octokit } from '@octokit/rest'
import { createOctokit } from '../utils/octokit.ts'
import { RAW_DATA, WEBSITE } from './constants.ts'
import type { PublishedFile, Publisher } from './types.ts'

interface RepoRef {
  owner: string
  repo: string
}

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

/** Én commit med mange filer (tekst og binært) på en eksisterende branch. */
export async function commitFiles(
  repo: RepoRef,
  branch: string,
  files: PublishedFile[],
  message: string,
): Promise<void> {
  if (files.length === 0) return
  const gh = octokit()
  const { data: ref } = await gh.git.getRef({ ...repo, ref: `heads/${branch}` })
  const baseSha = ref.object.sha

  const tree = await Promise.all(
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

  const { data: newTree } = await gh.git.createTree({ ...repo, base_tree: baseSha, tree })
  const { data: commit } = await gh.git.createCommit({
    ...repo,
    message,
    tree: newTree.sha,
    parents: [baseSha],
  })
  await gh.git.updateRef({ ...repo, ref: `heads/${branch}`, sha: commit.sha })
}

function sameContent(remote: Buffer | null, local: string | Buffer): boolean {
  if (!remote) return false
  const localBuf = typeof local === 'string' ? Buffer.from(local, 'utf8') : local
  return remote.equals(localBuf)
}

/**
 * Publiserer endrede sider som én PR mot nettsiden. Filer som er identiske med
 * det som allerede ligger på main filtreres bort; er ingenting endret, lages
 * ingen PR.
 */
export class WebsitePublisher implements Publisher {
  async publish(files: PublishedFile[], summary: string): Promise<{ prUrl?: string }> {
    const repo = { owner: WEBSITE.owner, repo: WEBSITE.repo }
    const changed: PublishedFile[] = []
    for (const file of files) {
      const remote = await readRemoteFile(repo, WEBSITE.baseBranch, file.path)
      if (!sameContent(remote, file.content)) changed.push(file)
    }

    if (changed.length === 0) {
      console.log('[publish] Ingen endringer mot nettsiden — hopper over PR.')
      return {}
    }

    const gh = octokit()
    const { data: base } = await gh.repos.getBranch({ ...repo, branch: WEBSITE.baseBranch })
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const branch = `skribenter/oppdatering-${stamp}`
    await gh.git.createRef({ ...repo, ref: `refs/heads/${branch}`, sha: base.commit.sha })
    await commitFiles(repo, branch, changed, 'feat(skribenter): oppdater skribentprofiler')

    const { data: pr } = await gh.pulls.create({
      ...repo,
      head: branch,
      base: WEBSITE.baseBranch,
      title: `Skribentprofiler: ${changed.length} endrede filer`,
      body: [
        'Automatisk generert av skribent-pipelinen i Individet/tankesmia.',
        '',
        summary,
        '',
        '### Endrede filer',
        ...changed.map((f) => `- \`${f.path}\``),
      ].join('\n'),
    })
    console.log(`[publish] Opprettet PR: ${pr.html_url}`)
    return { prUrl: pr.html_url }
  }
}

export const RAW_DATA_REPO: RepoRef = { owner: RAW_DATA.owner, repo: RAW_DATA.repo }
