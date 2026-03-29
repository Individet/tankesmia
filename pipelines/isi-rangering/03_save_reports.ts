import { promises as fs } from 'fs'
import path from 'path'
import { Octokit } from '@octokit/rest'

interface Aktor {
  name: string
}

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
const WEBSITE_TARGET_DIR = 'content/isi'
const RAW_DATA_TARGET_DIR = 'isi-rangering'

let octokitClient: Octokit | undefined

function getOctokitClient(): Octokit {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN mangler. Sett variabelen før steg 03 kjøres.')
  }

  if (!octokitClient) {
    octokitClient = new Octokit({ auth: process.env.GITHUB_TOKEN })
  }

  return octokitClient
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
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

async function lesJsonFil<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8')
  return JSON.parse(content) as T
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

async function hentFilShaHvisFinnes(
  repo: RepoConfig,
  branch: string,
  filePath: string,
): Promise<string | undefined> {
  const octokit = getOctokitClient()

  try {
    const { data } = await octokit.repos.getContent({
      owner: repo.owner,
      repo: repo.repo,
      path: filePath,
      ref: branch,
    })

    if (!Array.isArray(data) && 'sha' in data) {
      return data.sha
    }
  } catch {
    // Fil finnes ikke - dette er forventet ved ny opprettelse.
  }

  return undefined
}

async function upsertFile(
  repo: RepoConfig,
  branch: string,
  filePath: string,
  content: string,
  message: string,
): Promise<void> {
  const octokit = getOctokitClient()
  const sha = await hentFilShaHvisFinnes(repo, branch, filePath)

  await octokit.repos.createOrUpdateFileContents({
    owner: repo.owner,
    repo: repo.repo,
    path: filePath,
    message,
    branch,
    content: Buffer.from(content, 'utf8').toString('base64'),
    sha,
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
      // Mappen finnes ikke remote - da er det ingenting å slette.
    }
  }

  await walk(rootPath)
  return filer
}

async function slettFil(
  repo: RepoConfig,
  branch: string,
  filePath: string,
  sha: string,
  message: string,
): Promise<void> {
  const octokit = getOctokitClient()
  await octokit.repos.deleteFile({
    owner: repo.owner,
    repo: repo.repo,
    path: filePath,
    message,
    branch,
    sha,
  })
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

async function lagWebsitePrForReports(
  actorSlugs: string[],
  outputDir: string,
  dryRun: boolean,
): Promise<void> {
  const publiserbare = await Promise.all(
    actorSlugs.map(async (actorSlug) => {
      const reportPath = path.join(outputDir, actorSlug, 'rapport.md')
      const exists = await fileExists(reportPath)
      if (!exists) {
        return null
      }

      const content = await fs.readFile(reportPath, 'utf8')
      return {
        actorSlug,
        content,
      }
    }),
  )

  const reports = publiserbare.filter((item) => item !== null)

  if (reports.length === 0) {
    console.log(
      '[03_save_reports] Fant ingen rapporter å publisere til individet.github.io.',
    )
    return
  }

  const branchNavn = `isi/save-reports-${utcTimestampCompact()}`

  if (dryRun) {
    console.log(
      `[03_save_reports] DRY RUN: Ville opprettet branch ${branchNavn} i ${WEBSITE_REPO.owner}/${WEBSITE_REPO.repo}.`,
    )
    for (const report of reports) {
      console.log(
        `[03_save_reports] DRY RUN: Ville oppdatert ${WEBSITE_TARGET_DIR}/${report.actorSlug}.md`,
      )
    }
    console.log(
      `[03_save_reports] DRY RUN: Ville opprettet PR fra ${branchNavn} til ${BASE_BRANCH}.`,
    )
    return
  }

  const baseSha = await hentBaseSha(WEBSITE_REPO, BASE_BRANCH)
  await opprettBranch(WEBSITE_REPO, branchNavn, baseSha)

  for (const report of reports) {
    const repoPath = `${WEBSITE_TARGET_DIR}/${report.actorSlug}.md`
    await upsertFile(
      WEBSITE_REPO,
      branchNavn,
      repoPath,
      report.content,
      `feat: oppdater ISI-rapport for ${report.actorSlug}`,
    )
    console.log(`[03_save_reports] Oppdaterte ${repoPath} i PR-branch.`)
  }

  const prUrl = await opprettPR(
    WEBSITE_REPO,
    branchNavn,
    BASE_BRANCH,
    `ISI: oppdaterte rapporter (${reports.length})`,
    [
      'Automatisk generert av ISI-pipeline steg 03.',
      '',
      `Antall rapporter: ${reports.length}`,
      'Slugs:',
      ...reports.map((report) => `- ${report.actorSlug}`),
    ].join('\n'),
  )

  console.log(`[03_save_reports] Opprettet PR: ${prUrl}`)
}

async function syncRawDataTilMain(
  actorSlugs: string[],
  outputDir: string,
  dryRun: boolean,
): Promise<void> {
  for (const actorSlug of actorSlugs) {
    const localActorDir = path.join(outputDir, actorSlug)
    const actorDirExists = await fileExists(localActorDir)
    if (!actorDirExists) {
      console.warn(
        `[03_save_reports] Hopper over rådata-sync for ${actorSlug}: mappe finnes ikke (${localActorDir}).`,
      )
      continue
    }

    const localFiles = await listLocalFilesRecursively(localActorDir)
    const localRelativeFiles = localFiles.map((filePath) =>
      toPosixPath(path.relative(localActorDir, filePath)),
    )

    const remoteRoot = `${RAW_DATA_TARGET_DIR}/${actorSlug}`
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
        `[03_save_reports] DRY RUN: Ville synket ${localRelativeFiles.length} filer til ${RAW_DATA_REPO.owner}/${RAW_DATA_REPO.repo}:${remoteRoot} (branch ${BASE_BRANCH}).`,
      )
      for (const [remoteFilePath] of filerSomSkalSlettes) {
        console.log(
          `[03_save_reports] DRY RUN: Ville slettet ${remoteFilePath}`,
        )
      }
      continue
    }

    for (const relativeFilePath of localRelativeFiles) {
      const absolutePath = path.join(localActorDir, relativeFilePath)
      const content = await fs.readFile(absolutePath, 'utf8')
      const remotePath = `${remoteRoot}/${relativeFilePath}`.replace(/\\/g, '/')

      await upsertFile(
        RAW_DATA_REPO,
        BASE_BRANCH,
        remotePath,
        content,
        `chore: sync ISI rådata for ${actorSlug}`,
      )
      console.log(`[03_save_reports] Synket ${remotePath} til main.`)
    }

    for (const [remoteFilePath, remoteSha] of filerSomSkalSlettes) {
      await slettFil(
        RAW_DATA_REPO,
        BASE_BRANCH,
        remoteFilePath,
        remoteSha,
        `chore: fjern foreldet ISI rådata for ${actorSlug}`,
      )
      console.log(`[03_save_reports] Slettet foreldet fil ${remoteFilePath}.`)
    }
  }
}

export async function saveReportsPipeline(
  aktorFil: string,
  outputDir: string,
  dryRun: boolean,
): Promise<void> {
  const aktorer = await lesJsonFil<Aktor[]>(aktorFil)
  const actorSlugs = aktorer.map((aktor) => slug(aktor.name))

  console.log(`[03_save_reports] Antall aktører i input: ${aktorer.length}`)

  if (!dryRun && !process.env.GITHUB_TOKEN) {
    throw new Error(
      '[03_save_reports] GITHUB_TOKEN mangler. Kan ikke skrive til GitHub uten token.',
    )
  }

  await lagWebsitePrForReports(actorSlugs, outputDir, dryRun)
  await syncRawDataTilMain(actorSlugs, outputDir, dryRun)

  console.log('[03_save_reports] Ferdig med lagring til GitHub-repoer.')
}
