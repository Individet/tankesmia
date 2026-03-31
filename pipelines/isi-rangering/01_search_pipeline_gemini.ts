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
import { Aktor } from './types'
import { DIMENSJONER } from './01_search_pipeline.ts'

const MODEL = 'gemini-2.5-flash-preview-04-17'
const MAX_OUTPUT_TOKENS = 5000
const BATCH_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const POLL_INTERVAL_MS = 10_000 // 10 seconds

const TERMINAL_STATES: JobState[] = [
  JobState.JOB_STATE_SUCCEEDED,
  JobState.JOB_STATE_FAILED,
  JobState.JOB_STATE_CANCELLED,
]

function lagSystemPrompt(manifest: string): string {
  return [
    'Du er en norsk politisk-filosofisk analytiker som vurderer offentlige aktørers holdninger til individets suverenitet og individuelle rettigheter.',
    'Du analyserer alltid fra perspektivet til manifestet nedenfor.',
    '',
    '--- START MANIFEST: INDIVIDETS SUVERENITET ---',
    manifest,
    '--- SLUTT MANIFEST ---',
    '',
    '',
    'Angi om påstanden du kommer med om hver underdimensjon er basert på direkte observasjon, inferens eller ingen informasjon. ',
    '',
    'ALDRI list kilder eller URLer i teksten! De blir lagt på automatisk. Fokuser all tekst på analyse og funn av kildene, men referer gjerne sparsommelig til dem.',
    'Skriv: "Haraldsen argumenterer i Dagsavisen at ..."',
    'ALDRI SKRIV: "Haraldsen argumenterer i artikkelen [navn på artikkel](url til artikkel)", dette er UNØDVENDIG.',
    'Skriv kompakt.',
  ].join('\n')
}

function lagOppgavePrompt(dimensjon: (typeof DIMENSJONER)[number]): string {
  const underpunkter = dimensjon.underdimensjoner
    .map(
      (u, i) => `### ${u}
${dimensjon.beskrivelser[i]}`,
    )
    .join('\n')

  return [
    'Her er dimensjonen som skal analyseres:',
    `Dimensjon ${dimensjon.id}: ${dimensjon.navn}`,
    '',
    underpunkter,
    '',
    'For HVER under-dimensjon skal du gjøre 5-6 målrettede nettsøk.',
    'Variér søkestrategiene: bruk synonymer, relaterte begreper, og aktørens kjente publikasjonskanaler (f.eks. ifølge profilen).',
    'Eksempel: For "bevegelsesfrihet", søk også på "innvandring", "grensekontroll", "fri bevegelse", "Schengen" etc.',
    '',
    'PRESISJON:',
    'Fokuser på aktørens personlige uttalelser, stemmegivning og publiserte tekster.',
    'Organisasjoner aktøren er med i kan brukes som kontekst, men skal ikke erstatte aktørens egne posisjoner.',
    'Skill alltid mellom hva aktøren har sagt og hva en organisasjon aktøren er medlem i har vedtatt, selv om sistnevnte selvfølgelig er en god indikasjon.',
    'Gjengi kun det kilden faktisk sier. Ikke utled, ekstrapoler eller legg til detaljer som ikke er eksplisitt i teksten.',
    'Hvis kilden er vag, si at kilden er vag.',
    '',
    `
OPPSETT AV DOKUMENTET:

Ha en under-overskrift per underdimensjon. For hver underdimensjon, list opp følgende:

**Funn:**
- En punktvis oppsummering av alle relevante funn for underdimensjonen, basert på kildene du har funnet. Hvert punkt skal være en konkret påstand om aktørens holdning eller handling, og bør være så presis som mulig.
**Tolkning:**
En liten paragraf eller to som tolker funnene. Hva indikerer de samlet om aktørens holdning til underdimensjonen? Er det konsistent, motstridende eller vagt? Hvordan veier du de ulike funnene opp mot hverandre?
**Indikasjon for observasjon:**
DIREKTE / INFERERT / INGEN INFORMASJON, en liten setning som begrunner valget.

Etter at du har listet opp alle underdimensjonene, lag en ## Oppsummering og en ## KONKLUSJON.
    `,
  ].join('\n')
}

function hentProfilPromptForAktor(
  aktor: Aktor,
  profiler: Map<string, string>,
): string {
  const key = `${slug(aktor.name)}-profil`
  const profil = profiler.get(key) || profiler.get(slug(aktor.name))

  if (!profil) {
    throw new Error(
      `Profil ikke funnet for aktør ${aktor.name} (søkt med nøkkel "${key}")`,
    )
  }

  return [
    'Her følger det litt generell informasjon om aktøren',
    '',
    profil,
  ].join('\n')
}

function tolkGeminiSvar(
  text: string,
  groundingChunks: GroundingChunk[],
): string {
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

async function ventPåBatch(
  ai: GoogleGenAI,
  batchName: string,
): Promise<BatchJob> {
  const deadline = Date.now() + BATCH_TIMEOUT_MS
  let job = await ai.batches.get({ name: batchName })

  while (!TERMINAL_STATES.includes(job.state as JobState)) {
    if (Date.now() >= deadline) {
      console.warn(
        `[01_search_pipeline_gemini] Batch ${batchName} nådde 30-minutters grense — avbryter.`,
      )
      await ai.batches.cancel({ name: batchName })
      throw new Error(
        `Gemini batch-jobb ${batchName} tidsavbrutt etter 30 minutter`,
      )
    }

    console.log(
      `[01_search_pipeline_gemini] Batch tilstand: ${job.state} — venter ${POLL_INTERVAL_MS / 1000}s ...`,
    )
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    job = await ai.batches.get({ name: batchName })
  }

  return job
}

export async function outputSearchPipeline(
  aktorFil: string,
  manifestFil: string,
  outputDir: string,
  dryRun: boolean,
): Promise<void> {
  const aktorer = await lesJsonFil<Aktor[]>(aktorFil)
  const manifest = await fs.readFile(manifestFil, 'utf8')

  // Load profiles from the output directory
  const profiler = new Map<string, string>()
  try {
    for (const aktor of aktorer) {
      const actorSlug = slug(aktor.name)
      const profilPath = path.join(outputDir, actorSlug, 'profil.md')
      try {
        const profilContent = await fs.readFile(profilPath, 'utf8')
        profiler.set(`${actorSlug}-profil`, profilContent)
      } catch (err) {
        /* skip if not found */
      }
    }
  } catch (error) {
    console.warn(`Feil under lasting av profiler: ${String(error)}`)
  }

  // Build list of (customId, aktor, dimensjon) pairs and InlinedRequest[]
  const systemPrompt = lagSystemPrompt(manifest)

  const pairs: Array<{
    customId: string
    aktor: Aktor
    dim: (typeof DIMENSJONER)[number]
  }> = []

  const inlinedRequests: InlinedRequest[] = []

  for (const dim of DIMENSJONER) {
    for (const aktor of aktorer) {
      const customId = `${slug(aktor.name)}-${dim.id.toLowerCase()}-search`
      const oppgavePrompt = lagOppgavePrompt(dim)
      const profilPrompt = hentProfilPromptForAktor(aktor, profiler)
      const userContent = [oppgavePrompt, profilPrompt].join('\n\n')

      pairs.push({ customId, aktor, dim })
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
  }

  console.log(`[01_search_pipeline_gemini] Antall aktører: ${aktorer.length}`)
  console.log(
    `[01_search_pipeline_gemini] Antall requests: ${inlinedRequests.length}`,
  )

  if (dryRun) {
    await fs.mkdir(outputDir, { recursive: true })
    const dryRunData = pairs.map(({ customId, aktor, dim }) => ({
      custom_id: customId,
      model: MODEL,
      aktor: aktor.name,
      dimensjon: dim.id,
    }))
    const dryRunPath = path.join(outputDir, '01_requests_dry_run.json')
    await fs.writeFile(dryRunPath, JSON.stringify(dryRunData, null, 2), 'utf8')
    console.log(
      `[01_search_pipeline_gemini] Dry run fullført for søk. Requests lagret til ${dryRunPath}`,
    )
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set')
  }

  const ai = new GoogleGenAI({ apiKey })

  console.log('[01_search_pipeline_gemini] Sender Gemini batch-jobb ...')
  let batchJob = await ai.batches.create({
    model: MODEL,
    src: inlinedRequests,
    config: { displayName: 'isi-search-pipeline' },
  })

  console.log(
    `[01_search_pipeline_gemini] Batch opprettet: ${batchJob.name} (tilstand: ${batchJob.state})`,
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
    `[01_search_pipeline_gemini] Mottok ${inlinedResponses.length} svar fra batch.`,
  )

  for (let i = 0; i < inlinedResponses.length; i++) {
    const inlinedResponse = inlinedResponses[i]
    // Match by metadata.customId; fall back to positional index with a warning
    const customId = inlinedResponse.metadata?.customId ?? (() => {
      const positional = pairs[i]?.customId ?? `item-${i}`
      console.warn(
        `[01_search_pipeline_gemini] metadata.customId mangler for svar ${i} — bruker posisjonsbasert nøkkel "${positional}"`,
      )
      return positional
    })()

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

    const markdown = tolkGeminiSvar(text, groundingChunks)

    // custom_id format: "bjornar-moxnes-d1-search"
    // Store in outputDir/bjornar-moxnes/d1-search.md
    const parts = customId.split('-')
    const dimIndex = parts.findIndex((p) => /^d[1-6]$/.test(p))

    let actorDirName = customId
    let fileName = `${customId}.md`

    if (dimIndex !== -1) {
      actorDirName = parts.slice(0, dimIndex).join('-')
      fileName = parts.slice(dimIndex).join('-') + '.md'
    }

    const actorDirPath = path.join(outputDir, actorDirName)
    await fs.mkdir(actorDirPath, { recursive: true })

    const filePath = path.join(actorDirPath, fileName)
    await fs.writeFile(filePath, markdown, 'utf-8')
    console.log(`Skrev søkerapport til ${filePath}`)
  }
}
