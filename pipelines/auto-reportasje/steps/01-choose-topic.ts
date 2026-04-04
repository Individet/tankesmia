import Anthropic from '@anthropic-ai/sdk'
import { promises as fs } from 'fs'
import path from 'path'

const TOPICS_USED_PATH = path.join(
  'pipelines',
  'auto-reportasje',
  'topics-used.json',
)

export interface Topic {
  slug: string
  title: string
  pitch?: string
}

interface HaikuCandidates {
  candidates: Topic[]
}

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_ATTEMPTS = 3

const SYSTEM_PROMPT = `Du er en redaktør for tenketanken Individet (individet.no), som formidler ideer om individuell frihet, selvbestemmelse og begrensning av statsmakt.

Du skal foreslå emner for reportasje-artikler konsistent med Individets profil:
- Historiske eller samtidige eksempler på individuell frihet vs. statlig makt
- Vitenskapsmenn, filosofer, økonomer, kunstnere forfulgt av autoritære regimer
- Konkrete hendelser som illustrerer NAP-brudd (Non-Aggression Principle) eller frihetens frukter
- Ikke direkte norsk politikk

Returner alltid gyldig JSON i formatet beskrevet av brukeren.`

function lagCandidatePrompt(alreadyUsed: string[], attempt: number): string {
  const usedList =
    alreadyUsed.length > 0 ? alreadyUsed.join(', ') : '(ingen brukt ennå)'
  const avoidNote =
    attempt > 1
      ? `\n\nDette er forsøk ${attempt}. Generer 5 helt ANDRE emner enn tidligere forslag.`
      : ''
  return `Foreslå 5 kandidatemner for reportasje-artikler om individuell frihet, historiske frihetsforkjempere eller autoritære overgrep.${avoidNote}

Allerede brukte slugs (unngå disse): ${usedList}

Svar med gyldig JSON på dette formatet:
{
  "candidates": [
    { "slug": "nikolai-vavilov", "title": "Nikolai Vavilov og vitenskapens martyrer", "pitch": "Kort beskrivelse av hvorfor dette er interessant" }
  ]
}`
}

interface CandidateAttempt {
  attempt: number
  response: unknown
  candidates: Topic[]
}

async function hentKandidater(
  client: Anthropic,
  usedSlugs: string[],
  attempt: number,
): Promise<{ candidates: Topic[]; raw: CandidateAttempt }> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: lagCandidatePrompt(usedSlugs, attempt),
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Haiku returnerte ikke tekstinnhold')
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(
      `Kunne ikke parse JSON fra Haiku-respons: ${textBlock.text}`,
    )
  }

  const parsed = JSON.parse(jsonMatch[0]) as HaikuCandidates
  return {
    candidates: parsed.candidates,
    raw: { attempt, response, candidates: parsed.candidates },
  }
}

export interface ChooseTopicResult {
  topic: Topic
  candidateLog: CandidateAttempt[]
}

export async function chooseTopic(): Promise<ChooseTopicResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY mangler')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const raw = await fs.readFile(TOPICS_USED_PATH, 'utf8')
  const usedSlugs: string[] = JSON.parse(raw)
  const candidateLog: CandidateAttempt[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(
      `[01-choose-topic] Forsøk ${attempt}/${MAX_ATTEMPTS} — henter kandidater fra Haiku...`,
    )
    const { candidates, raw: attemptLog } = await hentKandidater(
      client,
      usedSlugs,
      attempt,
    )
    candidateLog.push(attemptLog)
    console.log(
      `[01-choose-topic] Fikk ${candidates.length} kandidater: ${candidates.map((c) => c.slug).join(', ')}`,
    )

    const unused = candidates.filter((c) => !usedSlugs.includes(c.slug))
    if (unused.length > 0) {
      const chosen = unused[0]
      console.log(
        `[01-choose-topic] Valgte emne: ${chosen.slug} — "${chosen.title}"`,
      )
      return { topic: chosen, candidateLog }
    }

    console.log(
      `[01-choose-topic] Alle kandidater allerede brukt, prøver igjen...`,
    )
  }

  throw new Error(
    `Fant ikke ubrukt emne etter ${MAX_ATTEMPTS} forsøk. Legg til nye emner i topics-used.json eller la Haiku generere friske forslag.`,
  )
}

export async function markTopicAsUsed(topicSlug: string): Promise<void> {
  const raw = await fs.readFile(TOPICS_USED_PATH, 'utf8')
  const used: string[] = JSON.parse(raw)
  if (!used.includes(topicSlug)) {
    used.push(topicSlug)
    await fs.writeFile(TOPICS_USED_PATH, JSON.stringify(used, null, 2), 'utf8')
    console.log(`[01-choose-topic] Markerte "${topicSlug}" som brukt`)
  }
}
