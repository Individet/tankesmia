import { promises as fs } from 'fs'
import path from 'path'
import {
  hentBatchResultaterRaw,
  sendBatch,
  ventPåBatch,
  type BatchRequest,
} from './anthropic-live.ts'
import { lesJsonFil, slug } from './utils.ts'
import { Aktor } from './types'

interface Dimensjon {
  id: string
  navn: string
  underdimensjoner: string[]
  beskrivelser: string[]
}

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 5000

export const DIMENSJONER: Dimensjon[] = [
  {
    id: 'D1',
    navn: 'Kroppslig autonomi og selvbestemmelse',
    underdimensjoner: [
      '1.1 Medisinsk selvbestemmelse',
      '1.2 Livsstilsautonomi',
      '1.3 Bevegelsesfrihet',
      '1.4 Selvbestemmelse ved livets slutt',
    ],
    beskrivelser: [
      'Støtter aktøren individets rett til egne medisinske beslutninger uten statlig tvang? Har aktøren støttet obligatoriske medisinske tiltak?',
      'Fremmer aktøren individets rett til å velge livsstil (familieliv, kosthold, rusmidler til eget bruk, seksualitet, religiøs praksis) uten statlig innblanding der ingen tredjepart skades?',
      'Støtter aktøren fri bevegelse — inkl. retten til å forlate et land, bosette seg og arbeide uten unødige statlige restriksjoner?',
      'Anerkjenner aktøren individets rett til å bestemme over eget livs avslutning?',
    ],
  },
  {
    id: 'D2',
    navn: 'Ytringsfrihet og intellektuell autonomi',
    underdimensjoner: [
      '2.1 Ytringsfrihet — innhold',
      '2.2 Pressefrihet og redaksjonell uavhengighet',
      '2.3 Akademisk og vitenskapelig frihet',
      '2.4 Ytringsfrihet på digitale plattformer',
    ],
    beskrivelser: [
      'Har aktøren støttet lover eller regulering som begrenser lovlig ytring basert på innhold (hatytringslover, blasfemilover, “desinformasjon”-lovgivning)?',
      'Støtter aktøren statlig finansiering eller regulering av medier som skaper avhengighet? Har aktøren fremmet inngrep i redaksjonelle beslutninger?',
      'Har aktøren støttet posisjoner som underlegger akademisk forskning politisk kontroll?',
      'Støtter aktøren statlig regulering av private plattformers innholdsmoderering? Har aktøren oppfordret til avplattforming av lovlige ytringer?',
    ],
  },
  {
    id: 'D3',
    navn: 'Eiendomsrett og økonomisk frihet',
    underdimensjoner: [
      '3.1 Eiendomsvern, skatt og ekspropriering',
      '3.2 Næringsfrihet og regulering',
      '3.3 Handelsfrihet',
      '3.4 Monetær frihet',
    ],
    beskrivelser: [
      'Støtter aktøren statlig ekspropriasjon eller regulering som effektivt konfiskerer eiendomsverdi uten full kompensasjon? Ser aktøren skatt primært som et nødvendig onde med strenge grenser, eller som et instrument for omfordeling?',
      'Støtter aktøren tiltak som gjør det vanskeligere å starte, drive eller avslutte en virksomhet? Støtter aktøren statlige inngrep i kontraktsfriheten mellom arbeidsgiver og arbeidstaker?',
      'Støtter aktøren proteksjonisme, toll og eksportkontroll som primær næringspolitikk?',
      'Støtter aktøren prisregulering, statlig monopol på penger eller CBDC med overvåkings- og kontrollformål?',
    ],
  },
  {
    id: 'D4',
    navn: 'Rettsstat og likebehandling',
    underdimensjoner: [
      '4.1 Lik anvendelse av loven',
      '4.2 Rettslig uavhengighet',
      '4.3 Rettssikkerhet og uskyldspresumpsjon',
      '4.4 Begrenset statsmakt',
    ],
    beskrivelser: [
      'Støtter aktøren særbehandling (positiv diskriminering, kvotering, identitetsbaserte unntak) som bryter med likebehandlingsprinsippet?',
      'Har aktøren forsøkt å påvirke domstolsavgjørelser eller politisere juridiske prosesser?',
      'Støtter aktøren administrative sanksjoner eller andre tiltak som omgår rettsprosessen og reverserer bevisbyrden?',
      'Støtter aktøren konstitusjonelle begrensninger på statsmakten — eller søker aktøren fullmaktslover, nødrettsbestemmelser og delegering av lovgivningsmyndighet?',
    ],
  },
  {
    id: 'D5',
    navn: 'Forenings-, forsamlings- og religionsfrihet',
    underdimensjoner: [
      '5.1 Religionsfrihet',
      '5.2 Politisk foreningsfrihet',
      '5.3 Sivilsamfunn vs. statlig substitusjon',
      '5.4 Forsamlingsfrihet',
    ],
    beskrivelser: [
      'Støtter aktøren statlig regulering av religiøs praksis, tvungen sekularisme eller privilegering av én religiøs tradisjon?',
      'Støtter aktøren forbud mot eller regulering av politiske partier eller bevegelser basert på ideologisk innhold?',
      'Fremmer aktøren statlige løsninger der frivillig sivilsamfunn historisk har fylt behovet?',
      'Har aktøren støttet tiltak som begrenser retten til å møtes, demonstrere eller samles? Har aktøren ytret støtte til overvåking, identifisering av eller statlig trakkasering av lovlydige individer på bakgrunn av at de møtes, demonstrerer eller samles?',
    ],
  },
  {
    id: 'D6',
    navn: 'Digital autonomi og informasjonsfrihet',
    underdimensjoner: [
      '6.1 Overvåkning og personvern',
      '6.2 Digital identitet og kontroll',
      '6.3 Internettfrihet og kryptering',
      '6.4 Eierskap til egne data',
    ],
    beskrivelser: [
      'Har aktøren støttet masseovervåkning, datalagringspåbud eller statens tilgang til privat kommunikasjon uten domstolskjennelse?',
      'Støtter aktøren obligatoriske digitale ID-systemer, CBDC med programmerbar bruk, eller sosiale kredittmekanismer?',
      'Har aktøren støttet tiltak som begrenser kryptering, bakdører i kommunikasjonssystemer, eller statlig kontroll over internettinfrastruktur?',
      'Støtter aktøren individets rett til å eie og kontrollere egne data — eller fremmer aktøren statlig/korporativ datahøsting uten reelt samtykke?',
    ],
  },
  {
    id: 'D7',
    navn: 'Kapasitet og vilje til å beskytte individets suverenitet',
    underdimensjoner: [
      '7.1 Forsvar mot ekstern aggresjon',
      '7.2 Politiets kapasitet og integritet',
      '7.3 Straffesystemets beskyttende logikk',
      '7.4 Håndhevelse av kontrakter og eiendomsrett',
    ],
    beskrivelser: [
      'Argumenterer aktøren for et troverdig forsvar mot utenlandsk makt — og tar aktøren stilling til verneplikt vs. frivillig forsvar?',
      'Prioriterer aktøren effektiv beskyttelse av person og eiendom, kombinert med sterk rettssikkerhet mot politiovergrep?',
      'Er aktørens straffepolitikk orientert mot å beskytte potensielle ofre mot aggressorer — eller støtter aktøren straff for ikke-aggressive handlinger?',
      'Støtter aktøren et fungerende rettsvesen som håndhever kontrakter og eiendomsrett effektivt i praksis?',
    ],
  },
  {
    id: 'D8',
    navn: 'Barn, familie og statsmakt',
    underdimensjoner: [
      '8.1 Rett til privat og alternativ opplæring',
      '8.2 Læreplankontroll og foreldres myndighet',
      '8.3 Barnevern og statlig familieintervensjon',
      '8.4 Statlig verdiformidling og ideologisk formasjon',
    ],
    beskrivelser: [
      'Argumenterer aktøren for eller mot foreldres rett til å velge privat, religiøs eller hjemmebasert opplæring?',
      'Støtter aktøren sentralisert statlig læreplankontroll, eller foreldres og lokalsamfunnets pedagogiske myndighet?',
      'Argumenterer aktøren for lav eller høy terskel for statlig familieintervensjon — og krever aktøren sterk rettssikkerhet i barnevernssaker?',
      'Fremmer aktøren statlig finansiert verdiformidling som nøytral og legitim — eller problematiserer aktøren statens rolle som ideologisk formasjonsinstitusjon?',
    ],
  },
]

function lagSystemPrompt(
  manifest: string,
): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }> {
  return [
    {
      type: 'text' as const,
      text: [
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
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

function lagOppgavePrompt(dimensjon: Dimensjon): string {
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

function lagBatchRequests(
  aktorer: Aktor[],
  manifest: string,
  profiler: Map<string, string>,
): BatchRequest[] {
  const system = lagSystemPrompt(manifest)

  return DIMENSJONER.flatMap((dim) =>
    aktorer.map((aktor) => ({
      custom_id: `${slug(aktor.name)}-${dim.id.toLowerCase()}-search`,
      params: {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: [
          {
            type: 'web_search_20250305' as const,
            name: 'web_search' as const,
            max_uses: 24,
            user_location: {
              type: 'approximate',
              city: 'Oslo',
              region: 'Oslo',
              country: 'NO',
              timezone: 'Europe/Oslo',
            },
          },
        ],
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: lagOppgavePrompt(dim),
                cache_control: { type: 'ephemeral' as const },
              },
            ],
          },
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: hentProfilPromptForAktor(aktor, profiler),
                cache_control: { type: 'ephemeral' as const },
              },
            ],
          },
        ],
      },
    })),
  )
}

// ─── TYPES FOR RESULT PARSING ───
export type Citation = {
  type: 'web_search_result_location'
  cited_text: string
  url: string
  title: string
}

export type Innhold = {
  type: string
  message: {
    model: string
    id: string
    type: string
    role: 'assistant'
    content: Array<{
      type: 'text' | 'server_tool_use' | 'web_search_tool_result'
      text: string
      citations?: Citation[]
    }>
  }
}

export function tolkMarkdownFil(innhold: Innhold): string {
  if (!innhold || !innhold.message || !innhold.message.content) {
    return '_Ingen tekst generert._'
  }

  const sisteIkkeTextIndex = innhold.message.content
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element.type !== 'text')
    .map(({ index }) => index)
    .at(-1)

  const startIndex =
    typeof sisteIkkeTextIndex === 'number' ? sisteIkkeTextIndex + 1 : 0

  const textElementer = innhold.message.content
    .slice(startIndex)
    .filter((element) => element.type === 'text')

  const footnoteIndexByKey = new Map<string, number>()
  const footnotes: string[] = []

  const markdownInnhold = textElementer
    .map((element) => {
      const citations = element.citations ?? []

      if (citations.length === 0) {
        return element.text
      }

      const markorer = citations.map((citation) => {
        const key = `${citation.url}__${citation.cited_text}`
        const eksisterendeIndex = footnoteIndexByKey.get(key)

        if (eksisterendeIndex) {
          return `[^${eksisterendeIndex}]`
        }

        const nesteIndex = footnotes.length + 1
        footnoteIndexByKey.set(key, nesteIndex)
        footnotes.push(
          `[^${nesteIndex}]: "${citation.cited_text}" – [${citation.title}](${citation.url})`,
        )

        return `[^${nesteIndex}]`
      })

      return `${element.text}${markorer.join('')}`
    })
    .join('')

  if (footnotes.length === 0) {
    return markdownInnhold
  }

  return `${markdownInnhold}\n\n## Kilder\n\n${footnotes.join('\n')}`
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

  const requests = lagBatchRequests(aktorer, manifest, profiler)

  console.log(`[01_search_pipeline] Antall aktører: ${aktorer.length}`)
  console.log(`[01_search_pipeline] Antall requests: ${requests.length}`)

  if (dryRun) {
    await fs.mkdir(outputDir, { recursive: true })
    const dryRunPath = path.join(outputDir, '01_requests_dry_run.json')
    await fs.writeFile(dryRunPath, JSON.stringify(requests, null, 2), 'utf8')
    console.log(
      `[01_search_pipeline] Dry run fullført for søk. Requests lagret til ${dryRunPath}`,
    )
    return
  }

  const batchId = await sendBatch(requests, 'isi-search-pipeline')
  await ventPåBatch(batchId, 'isi-search-pipeline')
  const rawMap = await hentBatchResultaterRaw(batchId)

  for (const [custom_id, row] of rawMap.entries()) {
    const rawResult = (row as any).result

    if (!rawResult || rawResult.type !== 'succeeded') {
      console.log(`Hopper over ${custom_id}: ikke vellykket resultat`)
      continue
    }

    const markdown = tolkMarkdownFil(rawResult as Innhold)

    // custom_id format is typically "bjornar-moxnes-d1-search"
    // We want to store it in `outputDir/bjornar-moxnes/d1-search.md`
    const parts = custom_id.split('-')
    const dimIndex = parts.findIndex((p) => /^d[1-6]$/.test(p))

    let actorDirName = custom_id
    let fileName = `${custom_id}.md`

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
