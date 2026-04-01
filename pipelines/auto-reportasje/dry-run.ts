import { promises as fs } from 'fs'
import path from 'path'

const OUTPUT_DIR = 'dry-run-output'

const DRY_RUN_TOPIC = {
  slug: 'dry-run-test',
  title: 'Dry Run Test',
  pitch: 'Et testoppføring for dry-run av auto-reportasje-pipeline',
}

async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
}

async function saveRequest(filename: string, data: unknown): Promise<void> {
  const filePath = path.join(OUTPUT_DIR, filename)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
  console.log(`[dry-run] Lagret: ${filePath}`)
}

async function runDryRun(): Promise<void> {
  console.log('[dry-run] 🧪 Starter dry-run av auto-reportasje-pipeline...')
  await ensureOutputDir()

  const topic = DRY_RUN_TOPIC
  const date = new Date().toISOString().split('T')[0]

  // ── 01: Haiku topic generation ────────────────────────────────────────────
  await saveRequest('01-haiku-topic-generation.json', {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': 'REDACTED',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:
        'Du er en redaktør for tenketanken Individet (individet.no), som formidler ideer om individuell frihet...',
      messages: [
        {
          role: 'user',
          content:
            'Foreslå 5 kandidatemner for reportasje-artikler om individuell frihet...',
        },
      ],
    },
  })

  // ── 02: Batch API research ────────────────────────────────────────────────
  const subTopics = [
    'background',
    'key-events',
    'people',
    'quotes',
    'legacy',
    'individet-angle',
  ]

  const batchRequests = subTopics.map((sub) => ({
    custom_id: `${topic.slug}_${sub}`,
    params: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [
        {
          role: 'user',
          content: `Gjør research på emnet "${topic.title}" — sub-tema: ${sub}`,
        },
      ],
    },
  }))

  await saveRequest('02-batch-request.json', {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages/batches',
    headers: {
      'x-api-key': 'REDACTED',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'message-batches-2024-09-24',
      'content-type': 'application/json',
    },
    body: { requests: batchRequests },
  })

  // ── 03: Wikimedia search ──────────────────────────────────────────────────
  await saveRequest('03-wikimedia-search.json', {
    method: 'GET',
    url: `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic.title)}&srnamespace=6&format=json`,
    headers: {},
    body: null,
  })

  // ── 04: Opus article ──────────────────────────────────────────────────────
  const mockResearch = Object.fromEntries(
    subTopics.map((sub) => [`${topic.slug}_${sub}`, `[Mock research for ${sub}]`]),
  )

  const mockImages = {
    hero: {
      id: 'hero',
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/No_image_available.svg/480px-No_image_available.svg.png',
      license: 'Public Domain',
      attribution: 'Wikimedia Commons',
      alt: topic.title,
    },
    inline: [],
  }

  await saveRequest('04-opus-article.json', {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': 'REDACTED',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: {
      model: 'claude-opus-4-6',
      max_tokens: 4000,
      system: '[SYSTEM PROMPT — se 04-write-article.ts for fullstendig tekst]',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ topic, date, research: mockResearch, images: mockImages }),
        },
      ],
    },
  })

  // ── 05: GitHub rawdata ────────────────────────────────────────────────────
  const rawFilename = `${date}-${topic.slug}-research.json`

  await saveRequest('05-github-rawdata.json', {
    method: 'PUT',
    url: `https://api.github.com/repos/Individet/r-data/contents/raw/articles/${rawFilename}`,
    headers: {
      Authorization: 'Bearer REDACTED',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: {
      message: `chore: legg til forskningsdata for ${topic.slug} (${date})`,
      content: Buffer.from(
        JSON.stringify({ batchId: 'dry-run', topic, results: [] }, null, 2),
        'utf8',
      ).toString('base64'),
    },
  })

  // ── 06: GitHub PR ─────────────────────────────────────────────────────────
  const branchName = `article/${topic.slug}`

  await saveRequest('06-github-create-branch.json', {
    method: 'POST',
    url: 'https://api.github.com/repos/Individet/individet.github.io/git/refs',
    headers: {
      Authorization: 'Bearer REDACTED',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: {
      ref: `refs/heads/${branchName}`,
      sha: '[SHA_OF_MAIN_BRANCH]',
    },
  })

  const mockArticleMd = [
    '---',
    `title: "${topic.title}"`,
    `date: ${date}`,
    `slug: ${topic.slug}`,
    'description: "Testartikkel generert av dry-run"',
    'tags: [test]',
    '---',
    '',
    'Dette er en testartikkel generert av dry-run.',
  ].join('\n')

  await saveRequest('06-github-commit-md.json', {
    method: 'PUT',
    url: `https://api.github.com/repos/Individet/individet.github.io/contents/content/articles/${topic.slug}.md`,
    headers: {
      Authorization: 'Bearer REDACTED',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: {
      message: `feat: legg til artikkel "${topic.title}"`,
      branch: branchName,
      content: Buffer.from(mockArticleMd, 'utf8').toString('base64'),
    },
  })

  await saveRequest('06-github-commit-json.json', {
    method: 'PUT',
    url: `https://api.github.com/repos/Individet/individet.github.io/contents/src/assets/articles/${topic.slug}.json`,
    headers: {
      Authorization: 'Bearer REDACTED',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: {
      message: `feat: legg til bildemetadata for "${topic.slug}"`,
      branch: branchName,
      content: Buffer.from(
        JSON.stringify(mockImages, null, 2),
        'utf8',
      ).toString('base64'),
    },
  })

  await saveRequest('06-github-create-pr.json', {
    method: 'POST',
    url: 'https://api.github.com/repos/Individet/individet.github.io/pulls',
    headers: {
      Authorization: 'Bearer REDACTED',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: {
      head: branchName,
      base: 'main',
      title: `Auto-artikkel: ${topic.title}`,
      body: [
        `## Auto-generert artikkel: ${topic.title}`,
        '',
        `**Emne:** ${topic.slug}`,
        `**Dato:** ${date}`,
        `**Generert:** ${new Date().toISOString()}`,
        '',
        'Denne PR-en er automatisk generert av auto-reportasje-pipeline.',
        'Den merges automatisk etter 7 dager hvis ingen endringer er gjort.',
      ].join('\n'),
    },
  })

  console.log(
    `[dry-run] ✅ Dry-run fullført. Sjekk mappen: ${OUTPUT_DIR}/`,
  )
}

runDryRun().catch((err) => {
  console.error('[dry-run] FEIL:', err)
  process.exit(1)
})
