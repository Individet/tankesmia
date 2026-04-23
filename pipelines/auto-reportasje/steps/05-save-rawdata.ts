import { createOctokit } from '../../utils/octokit.ts'

const RAW_DATA_REPO = {
  owner: 'Individet',
  repo: 'r-data',
}

export async function saveRawdata(
  slug: string,
  date: string,
  rawBatch: unknown,
): Promise<void> {
  const octokit = createOctokit()

  const filename = `${date}-${slug}-research.json`
  const filePath = `raw/articles/${filename}`
  const content = JSON.stringify(rawBatch, null, 2)
  const contentBase64 = Buffer.from(content, 'utf8').toString('base64')

  console.log(
    `[05-save-rawdata] Lagrer rådata til ${RAW_DATA_REPO.owner}/${RAW_DATA_REPO.repo}:${filePath}...`,
  )

  let sha: string | undefined
  try {
    const { data } = await octokit.repos.getContent({
      owner: RAW_DATA_REPO.owner,
      repo: RAW_DATA_REPO.repo,
      path: filePath,
    })
    if (!Array.isArray(data) && 'sha' in data) {
      sha = data.sha
    }
  } catch {
    // Filen finnes ikke — dette er forventet ved første kjøring
  }

  await octokit.repos.createOrUpdateFileContents({
    owner: RAW_DATA_REPO.owner,
    repo: RAW_DATA_REPO.repo,
    path: filePath,
    message: `chore: legg til forskningsdata for ${slug} (${date})`,
    content: contentBase64,
    sha,
  })

  console.log(`[05-save-rawdata] Rådata lagret: ${filePath}`)
}
