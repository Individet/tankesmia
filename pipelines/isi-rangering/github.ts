import { Octokit } from '@octokit/rest'

let octokitClient: Octokit | undefined

function getOctokitClient(): Octokit {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN mangler. Sett variabelen.')
  }
  if (!octokitClient) {
    octokitClient = new Octokit({ auth: process.env.GITHUB_TOKEN })
  }
  return octokitClient
}

export async function hentBaseSha(
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  const octokit = getOctokitClient()
  const { data } = await octokit.repos.getBranch({ owner, repo, branch })
  return data.commit.sha
}

export async function opprettBranch(
  owner: string,
  repo: string,
  branchNavn: string,
  sha: string,
): Promise<void> {
  const octokit = getOctokitClient()
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchNavn}`,
    sha,
  })
}

export async function commitFil(
  owner: string,
  repo: string,
  branch: string,
  filsti: string,
  innhold: string,
  melding: string,
): Promise<void> {
  const octokit = getOctokitClient()
  // Sjekk om filen finnes (for å hente SHA ved oppdatering)
  let eksisterendeSha: string | undefined
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: filsti,
      ref: branch,
    })
    if (!Array.isArray(data) && 'sha' in data) {
      eksisterendeSha = data.sha
    }
  } catch {
    // Filen finnes ikke — det er OK
  }

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filsti,
    message: melding,
    content: Buffer.from(innhold, 'utf8').toString('base64'),
    branch,
    sha: eksisterendeSha,
  })
}

export async function opprettPR(
  owner: string,
  repo: string,
  head: string,
  base: string,
  tittel: string,
  kropp: string,
): Promise<string> {
  const octokit = getOctokitClient()
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title: tittel,
    body: kropp,
    head,
    base,
  })
  return data.html_url
}
