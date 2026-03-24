import { promises as fs } from 'fs'
import path from 'path'
import {
  hentBatchResultater,
  sendBatch,
  ventPåBatch,
  type BatchRequest,
<<<<<<< HEAD
} from './anthropic-live.ts'
import { slug } from './utils.ts'
import { Aktor } from './types.ts'
=======
} from './anthropic-live'

export interface Aktor {
  name: string
  type: string
  parti?: string
  tilhørighet?: string
  jurisdiksjon?: string
  periode?: string
  beskrivelse?: string
}
>>>>>>> b9ea85f... WIP

const MODEL = 'claude-opus-4-6'
const MAX_TOKENS = 16000

<<<<<<< HEAD
=======
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

>>>>>>> b9ea85f... WIP
function lagSystemPrompt(isiRammeverk: string): Array<{
  type: 'text'
  text: string
  cache_control: { type: 'ephemeral' }
}> {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en analytisk agent for tankesmien Individet.',
        'Din oppgave er å ta research-rapporter (profil og dimensjonsrapporter) og sammenfatte det til en presis, formell ISI-rangering rapport.',
        'Ikke stol på research-rapportene blindt. Hvis en oppsummering ikke stemmer overens med det tilhørende sitatet, ignorer oppsummeringen og baser deg på sitatet.',
        'Du belønner prinsipielt, konsistent forsvar for frihet og straffer alle utvidelser av statlig makt som går på bekostninger av individets frihet og rettigheter.',
        'Ignorer gode intensjoner. Fokuser utelukkende på hvilke utfall og lovendringer aktøren støtter.',
        'Du skal returnere én markdown-fil som starter med riktig YAML frontmatter. Følg malen du blir gitt slavisk.',
        'Skriv kompromissløst. Bruk klart, akademisk, men skarpt språk (norsk).',
        '',
        'Her er rammeverket som definerer verdiene våre:',
        '--- START RAMMEVERK: INDIVIDETS SUVERENITET ---',
        isiRammeverk,
        '--- SLUTT RAMMEVERK ---',
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

function lagRapportInstruksjoner(mal: string): string {
  return [
    'Du skal nå skrive en komplett ISI-rapport for en gitt aktør.',
    '',
    'Her er malen du SKAL bruke:',
    '```markdown',
    mal,
    '```',
    '',
    '## Oppgave',
    'Bruk de innsamlede dataene (som følger) og malen for å skrive den ferdige rapporten.',
    'Sørg for at totalverdien, og indikatorverdien for hver dimensjon, beregnes og fylles inn i frontmatter.',
    'Bare output selve markdown-innholdet inkludert frontmatter. Ingen introduksjon eller avslutning utenfor.',
    `

### Rapport 2 — ISI-verdi


**Indikatorverdier — 24 underdimensjoner (−2 til +2, eller null):**

For hver underdimensjon: identifiser kilde → vurder konsistens over tid → skill eksplisitt fra implisitt posisjon → tildel indikatorverdi → én–tre setninger begrunnelse med kildehenvisning.

**Håndtering av manglende data:**
- Fravær av dokumentasjon i søkeresultatene betyr ikke NØDVENDIGVIS at aktøren ikke har tatt stilling, det kan være at informasjonen ikke er tilgjengelig eller ikke funnet.
- Trekk ALDRI normative konklusjoner fra manglende data (f.eks. "aktørens taushet svekker debatten").
- Underdimensjoner med \`evidence_level: "none"\` skal rapporteres som "Ikke vurdert (utilstrekkelig datagrunnlag)" — ikke som taushet eller manglende engasjement. I YAML skal indikatorverdien settes til \`null\`.
- Underdimensjoner med \`evidence_level: "inferred"\` skal markeres tydelig som infererte, med begrunnelse i brødteksten.
- Konklusjonen skal kun baseres på dimensjoner der data faktisk foreligger.

**Beregning av hoveddimensjonsverdi:**
- Hoveddimensjonsverdien skal aldri nevnes i rapporten, regler for å regne ut denne kan endre seg.
- Bruk heller fraser som indikerer at aktøren omtalt er "overveiende suverenitetsfremmende", "overveiende suverenitetshemmende", eller "har en blandet profil" basert på mønsteret i underdimensjonene, uten å nevne tall.
- Ikke nevn tall eller poengsum generelt. Fokuser på å beskrive mønstre og tendenser i aktørens posisjoner.

**YAML frontmatter:**
- \`created\`: '${new Date().toISOString()}'
- \`lastUpdated\`: '${new Date().toISOString()}'
- \`author\`: ${MODEL} 
- \`confidenceLevel\`: "høy" / "middels" / "lav" — basert på primærkildetilgang
- \`dataGaps\`: underdimensjoner uten noen kilder/grunnlag (indikatorverdi settes til \`null\`) 
- \`primarySources\`: alle primærkilder brukt, få med tittel og URL: {title: "dokument-tittel", url: "url"}
- \`secondarySources\`: alle sekundærkilder brukt, få med tittel og URL: {title: "dokument-tittel", url: "url"}

**Ingresssetningen:** Én ubetinget setning — kjerneprofil og viktigste funn. Ingen forbehold.

**Konklusjon:** Presis og direkte. Si hva analysen faktisk viser.

---

## Normative retningslinjer

ISI er ikke politisk nøytral. Rammeverket er forankret i selveierskapsprinsippet og ikke-aggresjonsprinsippet (NAP), beskrevet i \`references/ISI.md\` Del V.

**Tre regler som aldri kan fravikes:**

1. **Intensjonsimmunitet.** Gode intensjoner endrer ikke den moralske karakteren av tvang.
2. **Resultatuavhengighet.** ISI måler frihet, ikke utfall.
3. **Asymmetri.** Ikke juster skalaen for å unngå lave verdier — de er informative.

---

## Feilmodi å unngå

| Feil                                           | Korreksjon                                                 |
| ---------------------------------------------- | ---------------------------------------------------------- |
| Setter indikatorverdi uten å dokumentere kilde | Foreta rimelige utledninger eller sett N/A (\`null\`)      |
| Lar "god intensjon" heve indikatorverdien      | Ignorer intensjon — evaluer handling og posisjon           |
| Glatter over inkonsistens                      | Flagg alltid intern inkonsistens eksplisitt                |
| Diplomatisk vaghet i konklusjon                | Skriv hva analysen faktisk viser                           |
| Spekulerer om ukjente posisjoner               | Sett indikatorverdi til N/A (\`null\`) og noter som datagap|


	`,
  ].join('\n')
}

function lagRapportData(aktor: Aktor, research: string): string {
  return [
    `Aktør som skal analyseres: ${aktor.name}`,
    '',
    'Her er funnene fra analysene utført på forhånd (profil og dimensjoner 1-6):',
    '',
    research,
  ].join('\n')
}

export async function endReportPipeline(
  aktorFil: string,
  templateFil: string,
  manifestFil: string,
<<<<<<< HEAD
  isiRammeverkFil: string,
=======
  isiRammeverk: string,
>>>>>>> b9ea85f... WIP
  outputDir: string,
  dryRun: boolean,
): Promise<void> {
  const aktorContent = await fs.readFile(aktorFil, 'utf8')
  const aktorer = JSON.parse(aktorContent) as Aktor[]
  const mal = await fs.readFile(templateFil, 'utf8')
  const manifest = await fs.readFile(manifestFil, 'utf8')
<<<<<<< HEAD
  const isiRammeverk = await fs.readFile(isiRammeverkFil, 'utf8')
=======
>>>>>>> b9ea85f... WIP

  const requests: BatchRequest[] = []

  for (const aktor of aktorer) {
    const actorSlug = slug(aktor.name)
    const actorDir = path.join(outputDir, actorSlug)

<<<<<<< HEAD
    const requiredFiles = [
      'profil.md',
      'd1-search.md',
      'd2-search.md',
      'd3-search.md',
      'd4-search.md',
      'd5-search.md',
      'd6-search.md',
    ]

    const fileChecks = await Promise.all(
      requiredFiles.map(async (file) => {
        const filePath = path.join(actorDir, file)
        try {
          await fs.access(filePath)
          return { file, exists: true }
        } catch {
          return { file, exists: false }
        }
      }),
    )

    const mangler = fileChecks
      .filter((item) => !item.exists)
      .map((item) => item.file)

    if (mangler.length > 0) {
      console.warn(
        `[02_end_report] Hopper over ${aktor.name}: mangler grunnlagsfiler (${mangler.join(', ')}).`,
      )
      continue
    }

    const [profilData, d1Data, d2Data, d3Data, d4Data, d5Data, d6Data] =
      await Promise.all(
        requiredFiles.map((file) =>
          fs.readFile(path.join(actorDir, file), 'utf-8'),
        ),
      )

    const oppsamletResearch = [
      `### Profil\n${profilData}`,
      `### D1: Kroppslig autonomi\n${d1Data}`,
      `### D2: Ytringsfrihet\n${d2Data}`,
      `### D3: Økonomisk frihet\n${d3Data}`,
      `### D4: Rettsstat\n${d4Data}`,
      `### D5: Foreningsfrihet\n${d5Data}`,
      `### D6: Digital autonomi\n${d6Data}`,
    ].join('\n\n')

    requests.push({
      custom_id: `${actorSlug}-final-report`,
      params: {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: lagSystemPrompt(isiRammeverk),
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: lagRapportInstruksjoner(mal),
                cache_control: { type: 'ephemeral' as const },
              },
              {
                type: 'text' as const,
                text: lagRapportData(aktor, oppsamletResearch),
              },
            ],
          },
        ],
      },
    })
=======
    try {
      // Les inn alle 7 filene (hvis de finnes)
      const profilData = await fs
        .readFile(path.join(actorDir, 'profil.md'), 'utf-8')
        .catch(() => 'Profil ikke funnet')
      const d1Data = await fs
        .readFile(path.join(actorDir, 'd1-search.md'), 'utf-8')
        .catch(() => 'D1 ikke funnet')
      const d2Data = await fs
        .readFile(path.join(actorDir, 'd2-search.md'), 'utf-8')
        .catch(() => 'D2 ikke funnet')
      const d3Data = await fs
        .readFile(path.join(actorDir, 'd3-search.md'), 'utf-8')
        .catch(() => 'D3 ikke funnet')
      const d4Data = await fs
        .readFile(path.join(actorDir, 'd4-search.md'), 'utf-8')
        .catch(() => 'D4 ikke funnet')
      const d5Data = await fs
        .readFile(path.join(actorDir, 'd5-search.md'), 'utf-8')
        .catch(() => 'D5 ikke funnet')
      const d6Data = await fs
        .readFile(path.join(actorDir, 'd6-search.md'), 'utf-8')
        .catch(() => 'D6 ikke funnet')

      const oppsamletResearch = [
        `### Profil\n${profilData}`,
        `### D1: Kroppslig autonomi\n${d1Data}`,
        `### D2: Ytringsfrihet\n${d2Data}`,
        `### D3: Økonomisk frihet\n${d3Data}`,
        `### D4: Rettsstat\n${d4Data}`,
        `### D5: Foreningsfrihet\n${d5Data}`,
        `### D6: Digital autonomi\n${d6Data}`,
      ].join('\n\n')

      requests.push({
        custom_id: `${actorSlug}-final-report`,
        params: {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: lagSystemPrompt(isiRammeverk),
          messages: [
            {
              role: 'user' as const,
              content: [
                {
                  type: 'text' as const,
                  text: lagRapportInstruksjoner(mal),
                  cache_control: { type: 'ephemeral' },
                },
                {
                  type: 'text' as const,
                  text: lagRapportData(aktor, oppsamletResearch),
                },
              ],
            },
          ],
        },
      })
    } catch (e) {
      console.warn(
        `Manglende filer for ${aktor.name}, hopper over. (${String(e)})`,
      )
    }
>>>>>>> b9ea85f... WIP
  }

  console.log(`[02_end_report] Antall aktører å rapportere: ${requests.length}`)

  if (dryRun) {
    if (requests.length > 0) {
      await fs.mkdir(outputDir, { recursive: true })
      const dryRunPath = path.join(outputDir, '02_requests_dry_run.json')
      await fs.writeFile(dryRunPath, JSON.stringify(requests, null, 2), 'utf8')
      console.log(
        `[02_end_report] Ferdig dry-run. Requests lagret til ${dryRunPath}`,
      )
    } else {
      console.log(
        `[02_end_report] Ferdig dry-run. Ingen requests å lagre (fant sannsynligvis ikke research-filene).`,
      )
    }
    return
  }

  if (requests.length === 0) {
    console.log(`[02_end_report] Ingen requests å kjøre.`)
    return
  }

  const batchId = await sendBatch(requests, 'isi-final-report')
  await ventPåBatch(batchId, 'isi-final-report')
  const resultater = await hentBatchResultater(batchId)

  for (const [custom_id, info] of resultater.entries()) {
    const actorSlug = custom_id.replace('-final-report', '')
    let resultatInnhold = info.innhold

    // Repp noen ganger svar med ekstra markdown gjerder som vi vil fjerne.
    if (resultatInnhold.startsWith('```markdown')) {
      resultatInnhold = resultatInnhold.replace(/^```markdown\n/, '')
      resultatInnhold = resultatInnhold.replace(/\n```$/, '')
    }

    const reportPath = path.join(outputDir, actorSlug, 'rapport.md')
<<<<<<< HEAD
    await fs.mkdir(path.dirname(reportPath), { recursive: true })
=======
>>>>>>> b9ea85f... WIP
    await fs.writeFile(reportPath, resultatInnhold, 'utf-8')
    console.log(`Skrev ferdig rapport til ${reportPath}`)
  }
}
