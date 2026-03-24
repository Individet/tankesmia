/**
 * ISI Pipeline
 *
 * Input:  actors.json  — liste over aktører som skal analyseres
 * Output: To PRer per aktør
 *         PR 1 → rådata-repo:    raw-data/{slug}/research.json
 *         PR 2 → nettside-repo:  src/content/aktorer/{slug}/rapport.md
 *                                src/content/aktorer/{slug}/oversikt.md
 *
 * Flyt per aktør:
 *   Batch 1: 6 dimensjonsagenter (Sonnet + web_search)  →  rådata JSON
 *   Batch 2: 2 rapportagenter   (Opus)                  →  lang rapport + oppsummering
 *   GitHub:  branch → commit → PR (rådata-repo)
 *            branch → commit → PR (nettside-repo)
 */

import { Octokit } from '@octokit/rest'
import * as fs from 'fs'
import {
  lagDimensjonsAgentPrompt,
  lagLangRapportPrompt,
  lagOppsummeringsPrompt,
} from './prompts'
import * as liveClient from './anthropic-live'
import type { BatchResultat, BatchTokenForbruk } from './anthropic-live'

// ─── Konfigurasjon ────────────────────────────────────────────────────────────

const CONFIG = {
  models: {
    research: 'claude-sonnet-4-6',
    report: 'claude-opus-4-6',
  },
  github: {
    rawDataRepo: {
      owner: process.env.GITHUB_ORG ?? 'tenketanken',
      repo: 'isi-rådata',
    },
    websiteRepo: {
      owner: process.env.GITHUB_ORG ?? 'tenketanken',
      repo: 'individets-suverenitet',
    },
    baseBranch: 'main',
  },
  polling: {
    intervalMs: 60_000, // spør hvert minutt
  },
}

// ─── Typer ────────────────────────────────────────────────────────────────────

export interface Aktor {
  name: string
  type: string
  tilhørighet?: string
  jurisdiksjon?: string
  periode?: string
}

interface DimensjonsFunn {
  dimensjon: string
  dimensjonNavn: string
  funn: string // råtekst fra agenten, inkl. kilder
}

interface AktorRådata {
  aktor: Aktor
  timestamp: string
  dimensjoner: DimensjonsFunn[]
  anthropicTokenForbruk: {
    dimensjoner: BatchTokenForbruk
    rapporter: BatchTokenForbruk
  }
}

// ─── Dimensjonsdefinisjoner ───────────────────────────────────────────────────

export const DIMENSJONER = [
  {
    id: 'D1',
    navn: 'Kroppslig autonomi og selvbestemmelse',
    forankring:
      'Locke (selveierskapet), Rothbard (selveierskapsaksiomet), Mill (skadeprinsippet)',
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
    søkestrategi: `
      Søk etter: vaksineplikt, koronarestriksjoner, rusmiddelpolitikk, eutanasi/assistert død,
      bevegelsesrestriksjoner, pasientrettigheter, medisinsk frihet. Prioriter primærkilder.
    `,
  },
  {
    id: 'D2',
    navn: 'Ytringsfrihet og intellektuell autonomi',
    forankring:
      'Mill (On Liberty), Hayek (spontan orden i ideer), Spooner (naturlig rett til ytring)',
    underdimensjoner: [
      '2.1 Ytringsfrihet — innhold',
      '2.2 Pressefrihet og redaksjonell uavhengighet',
      '2.3 Akademisk og vitenskapelig frihet',
      '2.4 Ytringsfrihet på digitale plattformer',
    ],
    beskrivelser: [
      'Har aktøren støttet lover eller regulering som begrenser lovlig ytring basert på innhold (hatytringslover, blasfemilover, "desinformasjon"-lovgivning)?',
      'Støtter aktøren statlig finansiering eller regulering av medier som skaper avhengighet? Har aktøren fremmet inngrep i redaksjonelle beslutninger?',
      'Har aktøren støttet posisjoner som underlegger akademisk forskning politisk kontroll?',
      'Støtter aktøren statlig regulering av private plattformers innholdsmoderering? Har aktøren oppfordret til avplattforming av lovlige ytringer?',
    ],
    søkestrategi: `
      Søk etter: hatytringslover, ytringsfrihetskommisjonen, pressefrihet, PFU, mediestøtte,
      akademisk ytringsfrihet, plattformregulering, NRK-debatt, blasfemiloven,
      meningspoliti. Prioriter primærkilder.
    `,
  },
  {
    id: 'D3',
    navn: 'Eiendomsrett og økonomisk frihet',
    forankring:
      'Locke (arbeidsteori for eiendom), Bastiat (eiendom som pre-politisk), Nozick (berettigelsesteorien)',
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
    søkestrategi: `
      Søk etter: skattepolitikk, formuesskatt, ekspropriasjon, eiendomsregulering,
      næringsfrihet, arbeidsmiljøloven, tariffavtaler, handelspolitikk, CBDC,
      prisregulering, statlige monopoler. Prioriter primærkilder.
    `,
  },
  {
    id: 'D4',
    navn: 'Rettsstat og likebehandling',
    forankring:
      'Cicero (lex naturalis), Hayek (upersonlige regler), Bastiat (loven som vern, ikke plyndring)',
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
    søkestrategi: `
      Søk etter: kvotering, positiv diskriminering, fullmaktslover, nødrettsbestemmelser,
      domstolenes uavhengighet, administrative sanksjoner, rettsstatsprinsipper,
      bevisbyrde, likebehandling. Prioriter primærkilder.
    `,
  },
  {
    id: 'D5',
    navn: 'Forenings-, forsamlings- og religionsfrihet',
    forankring:
      'Hayek (spontan orden i sivilsamfunnet), Lane/Paterson (sivilsamfunn som alternativ til staten)',
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
    søkestrategi: `
      Søk etter: religionslovgivning, statskirke, politiske partiforbud, sivilsamfunn,
      frivillig sektor vs. statlige løsninger, demonstrasjonsfrihet,
      organisasjonsfrihet, trossamfunn. Prioriter primærkilder.
    `,
  },
  {
    id: 'D6',
    navn: 'Digital autonomi og informasjonsfrihet',
    forankring:
      'Selveierskapet utvidet til digitalt liv (Locke), Hayek (informasjonsfrihet som forutsetning for spontan orden)',
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
    søkestrategi: `
      Søk etter: datalagringsdirektivet, overvåkningslover, PST-fullmakter, digitalt ID,
      CBDC, krypteringspolitikk, personvern, GDPR-implementering, sosiale kredittmekanismer,
      datadeling, digital grenseovervåkning. Prioriter primærkilder.
    `,
  },
]

// ─── Hjelpefunksjoner ─────────────────────────────────────────────────────────

function lagSlug(navn: string): string {
  return navn
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function dagensDato(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Anthropic Batch API ──────────────────────────────────────────────────────

const batchClient: {
  sendBatch(requests: liveClient.BatchRequest[], label: string): Promise<string>
  ventPåBatch(batchId: string, label: string): Promise<void>
  hentBatchResultater(batchId: string): Promise<Map<string, BatchResultat>>
} = liveClient

function batchTokenForbrukFraResultater(
  batchId: string,
  resultater: Map<string, BatchResultat>,
): BatchTokenForbruk {
  return {
    batchId,
    requests: Array.from(resultater.entries()).map(([customId, resultat]) => ({
      customId,
      inputTokens: resultat.tokenForbruk.inputTokens,
      outputTokens: resultat.tokenForbruk.outputTokens,
    })),
  }
}

async function sendDimensjonsBatch(
  aktor: Aktor,
): Promise<{ batchId: string; requestIds: string[] }> {
  const requests = DIMENSJONER.map((dim) => ({
    custom_id: `${lagSlug(aktor.name)}-${dim.id.toLowerCase()}`,
    params: {
      model: CONFIG.models.research,
      max_tokens: 12000,
      tools: [
        { type: 'web_search_20250305' as const, name: 'web_search' as const },
      ],
      system: lagDimensjonsAgentPrompt(dim, aktor),
      messages: [
        {
          role: 'user' as const,
          content: `Innhent evidens om ${aktor.name} for ${dim.id}: ${dim.navn}. Analyseperiode: siste 3–5 år. Returner kun JSON som beskrevet.`,
        },
      ],
    },
  }))

  const batchId = await batchClient.sendBatch(requests, 'dimensjoner')
  console.log(`  [${aktor.name}] Dimensjonsbatch: ${batchId}`)
  return {
    batchId,
    requestIds: requests.map((r) => r.custom_id),
  }
}

async function sendRapportBatch(
  aktor: Aktor,
  dimensjonsFunn: string,
): Promise<{ batchId: string }> {
  const slug = lagSlug(aktor.name)

  const requests = [
    {
      custom_id: `${slug}-lang-rapport`,
      params: {
        model: CONFIG.models.report,
        max_tokens: 12000,
        system: lagLangRapportPrompt(aktor),
        messages: [
          {
            role: 'user' as const,
            content: `Her er forskningsfunnene fra alle seks dimensjonsagenter:\n\n${dimensjonsFunn}\n\nSkriv nå den fullstendige ISI-analysen.`,
          },
        ],
      },
    },
    {
      custom_id: `${slug}-oppsummering`,
      params: {
        model: CONFIG.models.report,
        max_tokens: 12000,
        system: lagOppsummeringsPrompt(aktor),
        messages: [
          {
            role: 'user' as const,
            content: `Her er de strukturerte dimensjonsfunnene:\n\n${dimensjonsFunn}\n\nSkriv oppsummeringsrapporten.`,
          },
        ],
      },
    },
  ]

  const batchId = await batchClient.sendBatch(requests, 'rapporter')
  console.log(`  [${aktor.name}] Rapportbatch: ${batchId}`)
  return { batchId }
}

// ─── GitHub API ───────────────────────────────────────────────────────────────

let octokitClient: Octokit | undefined

function getOctokitClient(): Octokit {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN mangler. Sett variabelen.')
  }
  if (!octokitClient) {
    octokitClient = new Octokit({ auth: process.env.GITHUB_TOKEN })
  }
  return octokitClient
}

async function hentBaseSha(
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  const octokit = getOctokitClient()
  const { data } = await octokit.repos.getBranch({ owner, repo, branch })
  return data.commit.sha
}

async function opprettBranch(
  owner: string,
  repo: string,
  branchNavn: string,
  sha: string,
): Promise<void> {
  const octokit = getOctokitClient()
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchNavn}`,
    sha,
  })
}

async function commitFil(
  owner: string,
  repo: string,
  branch: string,
  filsti: string,
  innhold: string,
  melding: string,
): Promise<void> {
  const octokit = getOctokitClient()
  // Sjekk om filen finnes (for å hente SHA ved oppdatering)
  let eksisterendeSha: string | undefined
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: filsti,
      ref: branch,
    })
    if (!Array.isArray(data) && 'sha' in data) {
      eksisterendeSha = data.sha
    }
  } catch {
    // Filen finnes ikke — det er OK
  }

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filsti,
    message: melding,
    content: Buffer.from(innhold, 'utf8').toString('base64'),
    branch,
    sha: eksisterendeSha,
  })
}

async function opprettPR(
  owner: string,
  repo: string,
  head: string,
  base: string,
  tittel: string,
  kropp: string,
): Promise<string> {
  const octokit = getOctokitClient()
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title: tittel,
    body: kropp,
    head,
    base,
  })
  return data.html_url
}

// ─── Hoved-pipeline per aktør ─────────────────────────────────────────────────

async function prosesserAktor(aktor: Aktor): Promise<void> {
  const slug = lagSlug(aktor.name)
  const dato = dagensDato()
  console.log(`\n═══ ${aktor.name} (${slug}) ═══`)

  // ── Steg 1: Dimensjonsbatch ──────────────────────────────────────────────

  console.log('  Steg 1: Sender dimensjonsbatch...')
  const { batchId: batch1Id } = await sendDimensjonsBatch(aktor)
  await batchClient.ventPåBatch(batch1Id, 'dimensjoner')
  const dimensjonsResultater = await batchClient.hentBatchResultater(batch1Id)
  const dimensjonsTokenForbruk = batchTokenForbrukFraResultater(
    batch1Id,
    dimensjonsResultater,
  )

  // Samle alle funn til én streng for rapportagentene
  const alleFunn = DIMENSJONER.map((dim) => {
    const resultat =
      dimensjonsResultater.get(`${slug}-${dim.id.toLowerCase()}`)?.innhold ?? ''
    return `## ${dim.id}: ${dim.navn}\n\n${resultat}`
  }).join('\n\n---\n\n')

  // ── Steg 2: Rapportbatch ─────────────────────────────────────────────────

  console.log('  Steg 2: Sender rapportbatch...')
  const { batchId: batch2Id } = await sendRapportBatch(aktor, alleFunn)
  await batchClient.ventPåBatch(batch2Id, 'rapporter')
  const rapportResultater = await batchClient.hentBatchResultater(batch2Id)
  const rapportTokenForbruk = batchTokenForbrukFraResultater(
    batch2Id,
    rapportResultater,
  )

  const langRapport =
    rapportResultater.get(`${slug}-lang-rapport`)?.innhold ?? 'Rapport mangler'
  const oppsummering =
    rapportResultater.get(`${slug}-oppsummering`)?.innhold ??
    'Oppsummering mangler'

  const rådata: AktorRådata = {
    aktor,
    timestamp: new Date().toISOString(),
    dimensjoner: DIMENSJONER.map((dim) => ({
      dimensjon: dim.id,
      dimensjonNavn: dim.navn,
      funn:
        dimensjonsResultater.get(`${slug}-${dim.id.toLowerCase()}`)?.innhold ??
        'Ingen funn',
    })),
    anthropicTokenForbruk: {
      dimensjoner: dimensjonsTokenForbruk,
      rapporter: rapportTokenForbruk,
    },
  }

  // ── Steg 3: PR til rådata-repo ───────────────────────────────────────────

  console.log('  Steg 3: Oppretter PR til rådata-repo...')
  const { owner: rOwner, repo: rRepo } = CONFIG.github.rawDataRepo
  const rBranchNavn = `isi/${slug}-${dato}`
  const rBaseSha = await hentBaseSha(rOwner, rRepo, CONFIG.github.baseBranch)

  await opprettBranch(rOwner, rRepo, rBranchNavn, rBaseSha)
  await commitFil(
    rOwner,
    rRepo,
    rBranchNavn,
    `raw-data/${slug}/research.json`,
    JSON.stringify(rådata, null, 2),
    `chore: legg til ISI-rådata for ${aktor.name}`,
  )

  const rPrUrl = await opprettPR(
    rOwner,
    rRepo,
    rBranchNavn,
    CONFIG.github.baseBranch,
    `ISI rådata: ${aktor.name}`,
    `Automatisk generert rådata fra ISI-pipeline.\n\n- **Aktør:** ${aktor.name}\n- **Type:** ${aktor.type}\n- **Dato:** ${dato}\n- **Batch ID (dimensjoner):** ${batch1Id}\n\nGodkjenn for å lagre rådata permanent. Kan brukes til å regenerere rapporter uten nye søk.`,
  )
  console.log(`  Rådata-PR: ${rPrUrl}`)

  // ── Steg 4: PR til nettside-repo ─────────────────────────────────────────

  console.log('  Steg 4: Oppretter PR til nettside-repo...')
  const { owner: wOwner, repo: wRepo } = CONFIG.github.websiteRepo
  const wBranchNavn = `isi/${slug}-${dato}`
  const wBaseSha = await hentBaseSha(wOwner, wRepo, CONFIG.github.baseBranch)

  await opprettBranch(wOwner, wRepo, wBranchNavn, wBaseSha)

  await commitFil(
    wOwner,
    wRepo,
    wBranchNavn,
    `src/content/aktorer/${slug}/rapport.md`,
    langRapport,
    `feat: legg til ISI-analyse for ${aktor.name}`,
  )

  await commitFil(
    wOwner,
    wRepo,
    wBranchNavn,
    `src/content/aktorer/${slug}/oversikt.md`,
    oppsummering,
    `feat: legg til ISI-oversikt for ${aktor.name}`,
  )

  const wPrUrl = await opprettPR(
    wOwner,
    wRepo,
    wBranchNavn,
    CONFIG.github.baseBranch,
    `ISI-analyse: ${aktor.name}`,
    `Automatisk generert ISI-analyse.\n\n- **Aktør:** ${aktor.name}\n- **Type:** ${aktor.type}${aktor.tilhørighet ? `\n- **Tilhørighet:** ${aktor.tilhørighet}` : ''}\n- **Dato:** ${dato}\n\n### Filer\n- \`rapport.md\` — fullstendig analytisk rapport\n- \`oversikt.md\` — oppsummering med indikatorverdi per underdimensjon\n\n### Kvalitetssikring\nSjekk at:\n- [ ] Alle 26 underdimensjoner har indikatorverdi\n- [ ] Kildehenvisninger er etterprøvbare\n- [ ] Konklusjonen er presis og ubetinget`,
  )
  console.log(`  Nettside-PR: ${wPrUrl}`)

  console.log(`  ✓ ${aktor.name} ferdig.`)
}

// ─── Inngangspunkt ────────────────────────────────────────────────────────────

export async function main(aktørFil: string): Promise<void> {
  if (!fs.existsSync(aktørFil)) {
    console.error(`Finner ikke ${aktørFil}`)
    process.exit(1)
  }

  const aktører: Aktor[] = JSON.parse(fs.readFileSync(aktørFil, 'utf8'))
  console.log(`ISI-pipeline starter (LIVE). ${aktører.length} aktør(er).\n`)

  for (const aktor of aktører) {
    await prosesserAktor(aktor)
  }

  console.log('\n✓ Pipeline ferdig.')
}
