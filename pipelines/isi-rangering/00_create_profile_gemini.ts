import { promises as fs } from 'fs'
import path from 'path'
import {
  GoogleGenAI,
  JobState,
  type BatchJob,
  type GroundingChunk,
  type GroundingMetadata,
  type InlinedRequest,
} from '@google/genai'
import { lesJsonFil, slug } from './utils.ts'
import { Aktor } from './types.ts'

const MODEL = 'gemini-2.5-flash-preview-04-17'
const MAX_OUTPUT_TOKENS = 2200
const BATCH_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const POLL_INTERVAL_MS = 10_000 // 10 seconds

const TERMINAL_STATES: JobState[] = [
  JobState.JOB_STATE_SUCCEEDED,
  JobState.JOB_STATE_FAILED,
  JobState.JOB_STATE_CANCELLED,
]

function lagSystemPrompt(): string {
  return [
    'Du er en norsk research-analytiker som skriver konsise aktørprofiler i markdown.',
    'Bruk web-søk aktivt, men hold deg til dokumenterbare forhold.',
    'Når du oppsummerer en kilde, gjengi kun det kilden faktisk sier.',
    'Ikke utled, ekstrapoler eller legg til detaljer som ikke er eksplisitt i teksten. Hvis kilden er vag, si at kilden er vag.',
    'Pek gjerne på referanser for påstandene dine.',
    'Vær konkret, nøktern og kortfattet.',
  ].join('\n')
}

function lagProfilPrompt(): string {
  return [
    'Lag en kort, generell aktørprofil basert på brede nettsøk.',
    'Du har maks 10 søk totalt. Prioriter bredde og kilder med høy troverdighet.',
    '',
    'Profilen skal dekke disse punktene:',
    '- Hvor aktøren vanligvis publiserer meningsinnlegg (f.eks. Stortinget, blogg, X/Twitter, aviser, podkast).',
    '- Ideologisk plassering.',
    '- Kontroverser.',
    '- Profilerte saker.',
    '',
    'Svar i markdown med disse overskriftene:',
    '## Ideologisk plassering',
    '## Kontroverser',
    '## Profilerte saker',
    '## Publiseringskanaler',
    '## Andre relevante funn',
  ].join('\n')
}

function lagAktorPrompt(aktor: Aktor): string {
  return [
    `Aktør: ${aktor.name}`,
    `Type: ${aktor.type}`,
    aktor.parti ? `Parti: ${aktor.parti}` : null,
    aktor.tilhørighet ? `Tilhørighet: ${aktor.tilhørighet}` : null,
    aktor.jurisdiksjon ? `Jurisdiksjon: ${aktor.jurisdiksjon}` : null,
    aktor.periode ? `Periode: ${aktor.periode}` : null,
    aktor.beskrivelse ? `Beskrivelse: ${aktor.beskrivelse}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function byggProfilMarkdown(aktor: Aktor, profiltekst: string): string {
  const metadata = [
    `- Type: ${aktor.type}`,
    aktor.parti ? `- Parti: ${aktor.parti}` : null,
    aktor.tilhørighet ? `- Tilhørighet: ${aktor.tilhørighet}` : null,
    aktor.jurisdiksjon ? `- Jurisdiksjon: ${aktor.jurisdiksjon}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return [
    `# Aktørprofil: ${aktor.name}`,
    metadata,
    aktor.beskrivelse ? `> ${aktor.beskrivelse}` : null,
    profiltekst.trim() || '_Ingen profiltekst mottatt._',
    '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function tolkGeminiSvar(text: string, groundingChunks: GroundingChunk[]): string {
  if (!text) {
    return '_Ingen tekst generert._'
  }

  if (!groundingChunks || groundingChunks.length === 0) {
    return text
  }

  const footnotes: string[] = []
  for (const chunk of groundingChunks) {
    if (chunk.web?.uri) {
      const num = footnotes.length + 1
      const title = chunk.web.title ?? chunk.web.uri
      footnotes.push(`[^${num}]: [${title}](${chunk.web.uri})`)
    }
  }

  if (footnotes.length === 0) {
    return text
  }

  return `${text}\n\n## Kilder\n\n${footnotes.join('\n')}`
}

function resolveCustomId(
  metadata: Record<string, string> | undefined,
  index: number,
  pairs: Array<{ customId: string; aktor: Aktor }>,
  logPrefix: string,
): string {
  if (metadata?.customId) {
    return metadata.customId
  }
  const positional = pairs[index]?.customId ?? `item-${index}`
  console.warn(
    `${logPrefix} metadata.customId mangler for svar ${index} — bruker posisjonsbasert nøkkel "${positional}"`,
  )
  return positional
}


async function ventPåBatch(
  ai: GoogleGenAI,
  batchName: string,
): Promise<BatchJob> {
  const deadline = Date.now() + BATCH_TIMEOUT_MS
  let job = await ai.batches.get({ name: batchName })

  while (!TERMINAL_STATES.includes(job.state as JobState)) {
    if (Date.now() >= deadline) {
      console.warn(
        `[00_create_profile_gemini] Batch ${batchName} nådde 30-minutters grense — avbryter.`,
      )
      await ai.batches.cancel({ name: batchName })
      throw new Error(
        `Gemini batch-jobb ${batchName} tidsavbrutt etter 30 minutter`,
      )
    }

    console.log(
      `[00_create_profile_gemini] Batch tilstand: ${job.state} — venter ${POLL_INTERVAL_MS / 1000}s ...`,
    )
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    job = await ai.batches.get({ name: batchName })
  }

  return job
}

export async function createProfilesPipeline(
  aktorFil: string,
  outputDir: string,
  dryRun: boolean,
): Promise<void> {
  const aktorer = await lesJsonFil<Aktor[]>(aktorFil)

  const systemPrompt = lagSystemPrompt()
  const profilPrompt = lagProfilPrompt()

  const pairs: Array<{ customId: string; aktor: Aktor }> = []
  const inlinedRequests: InlinedRequest[] = []

  for (const aktor of aktorer) {
    const customId = `${slug(aktor.name)}-profile`
    const userContent = [profilPrompt, lagAktorPrompt(aktor)].join('\n\n')

    pairs.push({ customId, aktor })
    inlinedRequests.push({
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      metadata: { customId },
      config: {
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    })
  }

  console.log(`[00_create_profile_gemini] Antall aktører: ${aktorer.length}`)
  console.log(
    `[00_create_profile_gemini] Antall requests: ${inlinedRequests.length}`,
  )

  if (dryRun) {
    await fs.mkdir(outputDir, { recursive: true })
    const dryRunData = pairs.map(({ customId, aktor }) => ({
      custom_id: customId,
      model: MODEL,
      aktor: aktor.name,
    }))
    const dryRunPath = path.join(outputDir, '00_requests_dry_run.json')
    await fs.writeFile(dryRunPath, JSON.stringify(dryRunData, null, 2), 'utf8')
    console.log(
      `[00_create_profile_gemini] Ferdig dry-run. Requests lagret til ${dryRunPath}`,
    )
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set')
  }

  const ai = new GoogleGenAI({ apiKey })

  console.log('[00_create_profile_gemini] Sender Gemini batch-jobb ...')
  let batchJob = await ai.batches.create({
    model: MODEL,
    src: inlinedRequests,
    config: { displayName: 'isi-create-profile' },
  })

  console.log(
    `[00_create_profile_gemini] Batch opprettet: ${batchJob.name} (tilstand: ${batchJob.state})`,
  )

  if (!batchJob.name) {
    throw new Error(
      'Gemini batch-jobb ble opprettet uten et navn — kan ikke polle status',
    )
  }

  batchJob = await ventPåBatch(ai, batchJob.name)

  if (batchJob.state !== JobState.JOB_STATE_SUCCEEDED) {
    throw new Error(
      `Gemini batch-jobb endte med tilstand ${batchJob.state}: ${batchJob.error?.message ?? 'ukjent feil'}`,
    )
  }

  const inlinedResponses = batchJob.dest?.inlinedResponses ?? []
  console.log(
    `[00_create_profile_gemini] Mottok ${inlinedResponses.length} svar fra batch.`,
  )

  for (let i = 0; i < inlinedResponses.length; i++) {
    const inlinedResponse = inlinedResponses[i]
    const customId = resolveCustomId(
      inlinedResponse.metadata,
      i,
      pairs,
      '[00_create_profile_gemini]',
    )

    if (inlinedResponse.error) {
      console.error(
        `Feil for ${customId}: ${inlinedResponse.error.message ?? 'ukjent feil'}`,
      )
      continue
    }

    const response = inlinedResponse.response
    const text = response?.text ?? ''
    const groundingMeta: GroundingMetadata | undefined =
      response?.candidates?.[0]?.groundingMetadata
    const groundingChunks: GroundingChunk[] =
      groundingMeta?.groundingChunks ?? []

    const profiltekst = tolkGeminiSvar(text, groundingChunks)

    // Look up the actor for this customId
    const pair = pairs.find((p) => p.customId === customId) ?? pairs[i]
    if (!pair) {
      console.error(`Ingen aktør funnet for customId "${customId}" — hopper over`)
      continue
    }

    const markdown = byggProfilMarkdown(pair.aktor, profiltekst)

    const actorDir = path.join(outputDir, slug(pair.aktor.name))
    await fs.mkdir(actorDir, { recursive: true })

    const filePath = path.join(actorDir, 'profil.md')
    await fs.writeFile(filePath, markdown, 'utf8')
    console.log(`Skrev profil til ${filePath}`)
  }
}
