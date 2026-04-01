import { chooseTopic, markTopicAsUsed } from './steps/01-choose-topic.ts'
import { doResearch } from './steps/02-research.ts'
import { findArticleImages } from './steps/03-images.ts'
import { writeArticle } from './steps/04-write-article.ts'
import { saveRawdata } from './steps/05-save-rawdata.ts'
import { createPR } from './steps/06-create-pr.ts'

function log(step: string, message: string): void {
  console.log(`[${new Date().toISOString()}] ${step} ${message}`)
}

async function runPipeline(): Promise<void> {
  log('PIPELINE', '🚀 Starter auto-reportasje pipeline...')

  // ── Steg 1: Velg emne ─────────────────────────────────────────────────────
  log('STEG 1/6', 'Velger emne...')
  const topic = await chooseTopic()
  log('STEG 1/6', `✓ Valgte emne: ${topic.slug} — "${topic.title}"`)

  const date = new Date().toISOString().split('T')[0]

  // ── Steg 2: Research ──────────────────────────────────────────────────────
  log('STEG 2/6', 'Gjør research via Batch API...')
  const { results: research, rawBatch } = await doResearch(topic)
  log(
    'STEG 2/6',
    `✓ Research ferdig (${Object.keys(research).length} sub-emner)`,
  )

  // ── Steg 3: Bilder ────────────────────────────────────────────────────────
  log('STEG 3/6', 'Finner bilder fra Wikimedia Commons...')
  const images = await findArticleImages(topic)
  log(
    'STEG 3/6',
    `✓ Bilder funnet: hero + ${images.inline.length} inline`,
  )

  // ── Steg 4: Skriv artikkel ────────────────────────────────────────────────
  log('STEG 4/6', 'Skriver artikkel med Opus...')
  const article = await writeArticle(topic, research, images)
  log('STEG 4/6', `✓ Artikkel skrevet: "${article.frontmatter.title}"`)

  // ── Steg 5: Lagre rådata ─────────────────────────────────────────────────
  log('STEG 5/6', 'Lagrer rådata til r-data...')
  await saveRawdata(topic.slug, date, rawBatch)
  log('STEG 5/6', '✓ Rådata lagret')

  // ── Steg 6: Opprett PR ────────────────────────────────────────────────────
  log('STEG 6/6', 'Oppretter PR mot individet.github.io...')
  const prUrl = await createPR(article, images, date)
  log('STEG 6/6', `✓ PR opprettet: ${prUrl}`)

  // ── Marker emne som brukt ─────────────────────────────────────────────────
  await markTopicAsUsed(topic.slug)

  log('PIPELINE', '✨ Pipeline fullført!')
}

runPipeline().catch((err) => {
  console.error(`[${new Date().toISOString()}] PIPELINE FEIL:`, err)
  process.exit(1)
})
