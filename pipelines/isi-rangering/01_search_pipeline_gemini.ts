import { promises as fs } from 'fs'
import path from 'path'
import { GoogleGenAI, type GroundingChunk, type GroundingMetadata } from '@google/genai'
import { lesJsonFil, slug } from './utils.ts'
import { Aktor } from './types'
import { DIMENSJONER } from './01_search_pipeline.ts'

const MODEL = 'gemini-2.5-flash-preview-04-17'
const MAX_OUTPUT_TOKENS = 5000

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

  // Build list of (aktor, dimensjon) pairs
  const pairs: Array<{ aktor: Aktor; dim: (typeof DIMENSJONER)[number] }> = []
  for (const dim of DIMENSJONER) {
    for (const aktor of aktorer) {
      pairs.push({ aktor, dim })
    }
  }

  console.log(`[01_search_pipeline_gemini] Antall aktører: ${aktorer.length}`)
  console.log(`[01_search_pipeline_gemini] Antall requests: ${pairs.length}`)

  if (dryRun) {
    await fs.mkdir(outputDir, { recursive: true })
    const dryRunData = pairs.map(({ aktor, dim }) => ({
      custom_id: `${slug(aktor.name)}-${dim.id.toLowerCase()}-search`,
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
  const systemPrompt = lagSystemPrompt(manifest)

  for (const { aktor, dim } of pairs) {
    const customId = `${slug(aktor.name)}-${dim.id.toLowerCase()}-search`

    const oppgavePrompt = lagOppgavePrompt(dim)
    const profilPrompt = hentProfilPromptForAktor(aktor, profiler)

    const userContent = [oppgavePrompt, profilPrompt].join('\n\n')

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        config: {
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      })

      const text = response.text ?? ''
      const groundingMeta: GroundingMetadata | undefined =
        response.candidates?.[0]?.groundingMetadata
      const groundingChunks: GroundingChunk[] = groundingMeta?.groundingChunks ?? []

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
    } catch (err) {
      console.error(`Feil for ${customId}: ${String(err)}`)
    }
  }
}
