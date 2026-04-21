import { promises as fs } from 'fs'
import path from 'path'
import { Octokit } from '@octokit/rest'

type RepoConfig = {
  owner: string
  repo: string
}

const WEBSITE_REPO: RepoConfig = {
  owner: 'Individet',
  repo: 'individet.github.io',
}

const RAW_DATA_REPO: RepoConfig = {
  owner: 'Individet',
  repo: 'r-data',
}

const BASE_BRANCH = 'main'
const WEBSITE_TARGET_DIR = 'content/notater'
const RAW_DATA_TARGET_DIR = 'notat'

let octokitClient: Octokit | undefined

function getOctokitClient(): Octokit {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN mangler. Sett variabelen før publisering kjøres.')
  }

  if (!octokitClient) {
    octokitClient = new Octokit({ auth: process.env.GITHUB_TOKEN })
  }

  return octokitClient
}

function utcTimestampCompact(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function listLocalFilesRecursively(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absoluteEntryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const nested = await listLocalFilesRecursively(absoluteEntryPath)
      files.push(...nested)
      continue
    }

    if (entry.isFile()) {
      files.push(absoluteEntryPath)
    }
  }

  return files
}

async function hentBaseSha(repo: RepoConfig, branch: string): Promise<string> {
  const octokit = getOctokitClient()
  const { data } = await octokit.repos.getBranch({
    owner: repo.owner,
    repo: repo.repo,
    branch,
  })
  return data.commit.sha
}

async function opprettBranch(
  repo: RepoConfig,
  branchNavn: string,
  baseSha: string,
): Promise<void> {
  const octokit = getOctokitClient()
  await octokit.git.createRef({
    owner: repo.owner,
    repo: repo.repo,
    ref: `refs/heads/${branchNavn}`,
    sha: baseSha,
  })
}

async function batchCommit(
  repo: RepoConfig,
  branch: string,
  files: Array<{ path: string; content: string }>,
  deletions: string[],
  message: string,
): Promise<void> {
  if (files.length === 0 && deletions.length === 0) return

  const octokit = getOctokitClient()
  const baseSha = await hentBaseSha(repo, branch)

  const treeItems: Array<{
    path: string
    mode: '100644'
    type: 'blob'
    content?: string
    sha?: string | null
  }> = [
    ...files.map((file) => ({
      path: file.path,
      mode: '100644' as const,
      type: 'blob' as const,
      content: file.content,
    })),
    ...deletions.map((filePath) => ({
      path: filePath,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: null,
    })),
  ]

  const { data: tree } = await octokit.git.createTree({
    owner: repo.owner,
    repo: repo.repo,
    base_tree: baseSha,
    tree: treeItems,
  })

  const { data: commit } = await octokit.git.createCommit({
    owner: repo.owner,
    repo: repo.repo,
    message,
    tree: tree.sha,
    parents: [baseSha],
  })

  await octokit.git.updateRef({
    owner: repo.owner,
    repo: repo.repo,
    ref: `heads/${branch}`,
    sha: commit.sha,
  })
}

async function listRemoteFilesRecursively(
  repo: RepoConfig,
  branch: string,
  rootPath: string,
): Promise<Map<string, string>> {
  const octokit = getOctokitClient()
  const filer = new Map<string, string>()

  async function walk(currentPath: string): Promise<void> {
    try {
      const { data } = await octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path: currentPath,
        ref: branch,
      })

      if (!Array.isArray(data)) {
        if (data.type === 'file') {
          filer.set(data.path, data.sha)
        }
        return
      }

      for (const item of data) {
        if (item.type === 'file') {
          filer.set(item.path, item.sha)
          continue
        }

        if (item.type === 'dir') {
          await walk(item.path)
        }
      }
    } catch {
      // Mappen finnes ikke remote — ingenting å slette.
    }
  }

  await walk(rootPath)
  return filer
}

async function opprettPR(
  repo: RepoConfig,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<string> {
  const octokit = getOctokitClient()
  const { data } = await octokit.pulls.create({
    owner: repo.owner,
    repo: repo.repo,
    head,
    base,
    title,
    body,
  })

  return data.html_url
}

async function lagWebsitePr(
  notatSlug: string,
  notatMarkdown: string,
  dryRun: boolean,
): Promise<string | undefined> {
  const branchNavn = `notat/save-${notatSlug}-${utcTimestampCompact()}`

  if (dryRun) {
    console.log(
      `[04_github-publish] DRY RUN: Ville opprettet branch ${branchNavn} i ${WEBSITE_REPO.owner}/${WEBSITE_REPO.repo}.`,
    )
    console.log(
      `[04_github-publish] DRY RUN: Ville oppdatert ${WEBSITE_TARGET_DIR}/${notatSlug}.md`,
    )
    return undefined
  }

  const baseSha = await hentBaseSha(WEBSITE_REPO, BASE_BRANCH)
  await opprettBranch(WEBSITE_REPO, branchNavn, baseSha)

  await batchCommit(
    WEBSITE_REPO,
    branchNavn,
    [
      {
        path: `${WEBSITE_TARGET_DIR}/${notatSlug}.md`,
        content: notatMarkdown,
      },
    ],
    [],
    `feat: legg til notat ${notatSlug}`,
  )

  console.log(
    `[04_github-publish] Oppdaterte ${WEBSITE_TARGET_DIR}/${notatSlug}.md i PR-branch.`,
  )

  const prUrl = await opprettPR(
    WEBSITE_REPO,
    branchNavn,
    BASE_BRANCH,
    `Notat: ${notatSlug}`,
    [
      'Automatisk generert av notat-pipeline steg 04.',
      '',
      `Notat-slug: ${notatSlug}`,
    ].join('\n'),
  )

  console.log(`[04_github-publish] Opprettet PR: ${prUrl}`)
  return prUrl
}

async function syncRawData(
  notatSlug: string,
  outputDir: string,
  dryRun: boolean,
): Promise<void> {
  const localNotatDir = outputDir
  const actorDirExists = await fileExists(localNotatDir)
  if (!actorDirExists) {
    console.warn(
      `[04_github-publish] Hopper over rådata-sync: mappe finnes ikke (${localNotatDir}).`,
    )
    return
  }

  const localFiles = await listLocalFilesRecursively(localNotatDir)
  const localRelativeFiles = localFiles.map((filePath) =>
    toPosixPath(path.relative(localNotatDir, filePath)),
  )

  const remoteRoot = `${RAW_DATA_TARGET_DIR}/${notatSlug}`
  const remoteFiles = await listRemoteFilesRecursively(
    RAW_DATA_REPO,
    BASE_BRANCH,
    remoteRoot,
  )

  const ønskedeRemoteStier = new Set(
    localRelativeFiles.map((relativeFilePath) =>
      `${remoteRoot}/${relativeFilePath}`.replace(/\\/g, '/'),
    ),
  )

  const filerSomSkalSlettes = Array.from(remoteFiles.entries()).filter(
    ([remoteFilePath]) => !ønskedeRemoteStier.has(remoteFilePath),
  )

  if (dryRun) {
    console.log(
      `[04_github-publish] DRY RUN: Ville synket ${localRelativeFiles.length} filer til ${RAW_DATA_REPO.owner}/${RAW_DATA_REPO.repo}:${remoteRoot}.`,
    )
    for (const [remoteFilePath] of filerSomSkalSlettes) {
      console.log(`[04_github-publish] DRY RUN: Ville slettet ${remoteFilePath}`)
    }
    return
  }

  const upsertFiles: Array<{ path: string; content: string }> = []
  for (const relativeFilePath of localRelativeFiles) {
    const absolutePath = path.join(localNotatDir, relativeFilePath)
    const content = await fs.readFile(absolutePath, 'utf8')
    const remotePath = `${remoteRoot}/${relativeFilePath}`.replace(/\\/g, '/')
    upsertFiles.push({ path: remotePath, content })
  }

  const deletionPaths = filerSomSkalSlettes.map(
    ([remoteFilePath]) => remoteFilePath,
  )

  if (upsertFiles.length > 0 || deletionPaths.length > 0) {
    await batchCommit(
      RAW_DATA_REPO,
      BASE_BRANCH,
      upsertFiles,
      deletionPaths,
      `chore: sync notat rådata for ${notatSlug}`,
    )
    for (const file of upsertFiles) {
      console.log(`[04_github-publish] Synket ${file.path} til main.`)
    }
    for (const filePath of deletionPaths) {
      console.log(`[04_github-publish] Slettet foreldet fil ${filePath}.`)
    }
  }
}

export async function publishNotat(
  notatSlug: string,
  notatMarkdown: string,
  outputDir: string,
  dryRun: boolean,
): Promise<{ prUrl?: string }> {
  if (!process.env.GITHUB_TOKEN) {
    console.warn(
      '[04_github-publish] GITHUB_TOKEN mangler — hopper over GitHub-publisering.',
    )
    return {}
  }

  try {
    const prUrl = await lagWebsitePr(notatSlug, notatMarkdown, dryRun)
    await syncRawData(notatSlug, outputDir, dryRun)
    console.log('[04_github-publish] Ferdig med publisering til GitHub-repoer.')
    return { prUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `[04_github-publish] Publisering feilet — hopper over: ${message}`,
    )
    return {}
  }
}
