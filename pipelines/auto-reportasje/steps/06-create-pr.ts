import { Octokit } from '@octokit/rest'
import type { Article } from './04-write-article.ts'
import type { ArticleImages } from './03-images.ts'

const WEBSITE_REPO = {
  owner: 'Individet',
  repo: 'individet.github.io',
}

const BASE_BRANCH = 'main'

export async function createPR(
  article: Article,
  images: ArticleImages,
  date: string,
): Promise<string> {
  if (!process.env.GH_PAT) {
    throw new Error('GH_PAT mangler')
  }

  const octokit = new Octokit({ auth: process.env.GH_PAT })

  const { slug, title } = article.frontmatter
  const branchName = `article/${slug}`

  console.log(
    `[06-create-pr] Henter SHA for ${BASE_BRANCH} i ${WEBSITE_REPO.repo}...`,
  )

  const { data: branchData } = await octokit.repos.getBranch({
    owner: WEBSITE_REPO.owner,
    repo: WEBSITE_REPO.repo,
    branch: BASE_BRANCH,
  })
  const baseSha = branchData.commit.sha

  console.log(`[06-create-pr] Oppretter branch "${branchName}"...`)

  await octokit.git.createRef({
    owner: WEBSITE_REPO.owner,
    repo: WEBSITE_REPO.repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  })

  const mdPath = `content/articles/${slug}.md`
  const jsonPath = `src/assets/articles/${slug}.json`

  const mdContent = article.publishableMarkdown
  const jsonContent = JSON.stringify(
    { hero: images.hero, inline: images.inline },
    null,
    2,
  )

  console.log(`[06-create-pr] Oppretter fil ${mdPath}...`)
  await octokit.repos.createOrUpdateFileContents({
    owner: WEBSITE_REPO.owner,
    repo: WEBSITE_REPO.repo,
    path: mdPath,
    message: `feat: legg til artikkel "${title}"`,
    branch: branchName,
    content: Buffer.from(mdContent, 'utf8').toString('base64'),
  })

  console.log(`[06-create-pr] Oppretter fil ${jsonPath}...`)
  await octokit.repos.createOrUpdateFileContents({
    owner: WEBSITE_REPO.owner,
    repo: WEBSITE_REPO.repo,
    path: jsonPath,
    message: `feat: legg til bildemetadata for "${slug}"`,
    branch: branchName,
    content: Buffer.from(jsonContent, 'utf8').toString('base64'),
  })

  const prBody = buildPrBody(title, slug, date, article)

  console.log(`[06-create-pr] Oppretter PR fra "${branchName}" til "${BASE_BRANCH}"...`)

  const { data: pr } = await octokit.pulls.create({
    owner: WEBSITE_REPO.owner,
    repo: WEBSITE_REPO.repo,
    head: branchName,
    base: BASE_BRANCH,
    title: `Auto-artikkel: ${title}`,
    body: prBody,
  })

  console.log(`[06-create-pr] PR opprettet: ${pr.html_url}`)

  try {
    await octokit.issues.addLabels({
      owner: WEBSITE_REPO.owner,
      repo: WEBSITE_REPO.repo,
      issue_number: pr.number,
      labels: ['auto-merge'],
    })
    console.log(`[06-create-pr] Label "auto-merge" lagt til`)
  } catch (err) {
    console.warn(
      `[06-create-pr] Kunne ikke legge til label "auto-merge": ${String(err)}`,
    )
  }

  return pr.html_url
}

function buildPrBody(
  title: string,
  slug: string,
  date: string,
  article: Article,
): string {
  const timestamp = new Date().toISOString()

  return [
    `## Auto-generert artikkel: ${title}`,
    '',
    `**Emne:** ${slug}`,
    `**Dato:** ${date}`,
    `**Generert:** ${timestamp}`,
    '',
    '### Pitch til redaktør',
    '',
    article.pitch,
    '',
    '### Hook til sosiale medier',
    '',
    article.socialHook,
    '',
    '### Tags',
    article.frontmatter.tags.map((t) => `- ${t}`).join('\n'),
  ].join('\n')
}
