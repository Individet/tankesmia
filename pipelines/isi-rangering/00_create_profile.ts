import { promises as fs } from 'fs'
import path from 'path'
import {
  hentBatchResultaterRaw,
  sendBatch,
  ventPåBatch,
  type BatchRequest,
} from './anthropic-live.ts'
import { tolkMarkdownFil, type Innhold } from './01_search_pipeline'
import { lesJsonFil, slug } from './utils.ts'
import { Aktor } from './types.ts'

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 2200

function lagSystemPrompt(): Array<{
  type: 'text'
  text: string
  cache_control: { type: 'ephemeral' }
}> {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en norsk research-analytiker som skriver konsise aktørprofiler i markdown.',
        'Bruk web-søk aktivt, men hold deg til dokumenterbare forhold.',
        'Når du oppsummerer en kilde, gjengi kun det kilden faktisk sier.',
        'Ikke utled, ekstrapoler eller legg til detaljer som ikke er eksplisitt i teksten. Hvis kilden er vag, si at kilden er vag.',
        'Pek gjerne på referanser for påstandene dine.',
        'Vær konkret, nøktern og kortfattet.',
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
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

function lagBatchRequests(aktorer: Aktor[]): BatchRequest[] {
  const system = lagSystemPrompt()

  return aktorer.map((aktor) => ({
    custom_id: `${slug(aktor.name)}-profile`,
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: [
        {
          type: 'web_search_20250305' as const,
          name: 'web_search' as const,
          max_uses: 10,
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
              text: lagProfilPrompt(),
              cache_control: { type: 'ephemeral' as const },
            },
          ],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: lagAktorPrompt(aktor),
            },
          ],
        },
      ],
    },
  }))
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

export async function createProfilesPipeline(
  aktorFil: string,
  outputDir: string,
  dryRun: boolean,
): Promise<void> {
  const aktorer = await lesJsonFil<Aktor[]>(aktorFil)
  const requests = lagBatchRequests(aktorer)

  console.log(`[00_create_profile] Antall aktører: ${aktorer.length}`)
  console.log(`[00_create_profile] Antall requests: ${requests.length}`)

  if (dryRun) {
    await fs.mkdir(outputDir, { recursive: true })
    const dryRunPath = path.join(outputDir, '00_requests_dry_run.json')
    await fs.writeFile(dryRunPath, JSON.stringify(requests, null, 2), 'utf8')
    console.log(
      `[00_create_profile] Ferdig dry-run. Requests lagret til ${dryRunPath}`,
    )
    return
  }

  const batchId = await sendBatch(requests, 'isi-create-profile')
  await ventPåBatch(batchId, 'isi-create-profile')

  const rawMap = await hentBatchResultaterRaw(batchId)

  for (const aktor of aktorer) {
    const key = `${slug(aktor.name)}-profile`
    const row = rawMap.get(key)
    const rawResult = (row as any)?.result

    let profiltekst = ''
    if (rawResult && rawResult.type === 'succeeded') {
      profiltekst = tolkMarkdownFil(rawResult as Innhold)
    } else {
      console.log(`Manglende eller mislykket resultat for ${key}`)
    }

    const markdown = byggProfilMarkdown(aktor, profiltekst)

    const actorDir = path.join(outputDir, slug(aktor.name))
    await fs.mkdir(actorDir, { recursive: true })

    const filePath = path.join(actorDir, 'profil.md')
    await fs.writeFile(filePath, markdown, 'utf8')
    console.log(`Skrev profil til ${filePath}`)
  }
}
