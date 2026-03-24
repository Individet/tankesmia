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

import * as fs from 'fs'
import {
  lagDimensjonsAgentPrompt,
  lagLangRapportPrompt,
  lagOppsummeringsPrompt,
} from './prompts'
import * as liveClient from './anthropic-live'
import type { BatchResultat, BatchTokenForbruk } from './anthropic-live'
import { CONFIG } from './config'
import { commitFil, hentBaseSha, opprettBranch, opprettPR } from './github'
import type { AktorRådata } from './types'

// Re-exports so prompts.ts and tests can import from this file as before
export type { Aktor } from './types'
export { DIMENSJONER } from './dimensjoner'

import type { Aktor } from './types'
import { DIMENSJONER } from './dimensjoner'

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

// ─── Batch-orkestrering ───────────────────────────────────────────────────────

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
): Promise<{ batchId: string }> {
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

  const batchId = await liveClient.sendBatch(requests, 'dimensjoner')
  console.log(`  [${aktor.name}] Dimensjonsbatch: ${batchId}`)
  return { batchId }
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

  const batchId = await liveClient.sendBatch(requests, 'rapporter')
  console.log(`  [${aktor.name}] Rapportbatch: ${batchId}`)
  return { batchId }
}

// ─── Hoved-pipeline per aktør ─────────────────────────────────────────────────

async function prosesserAktor(aktor: Aktor): Promise<void> {
  const slug = lagSlug(aktor.name)
  const dato = dagensDato()
  console.log(`\n═══ ${aktor.name} (${slug}) ═══`)

  // ── Steg 1: Dimensjonsbatch ──────────────────────────────────────────────

  console.log('  Steg 1: Sender dimensjonsbatch...')
  const { batchId: batch1Id } = await sendDimensjonsBatch(aktor)
  await liveClient.ventPåBatch(batch1Id, 'dimensjoner')
  const dimensjonsResultater = await liveClient.hentBatchResultater(batch1Id)
  const dimensjonsTokenForbruk = batchTokenForbrukFraResultater(batch1Id, dimensjonsResultater)

  const alleFunn = DIMENSJONER.map((dim) => {
    const resultat = dimensjonsResultater.get(`${slug}-${dim.id.toLowerCase()}`)?.innhold ?? ''
    return `## ${dim.id}: ${dim.navn}\n\n${resultat}`
  }).join('\n\n---\n\n')

  // ── Steg 2: Rapportbatch ─────────────────────────────────────────────────

  console.log('  Steg 2: Sender rapportbatch...')
  const { batchId: batch2Id } = await sendRapportBatch(aktor, alleFunn)
  await liveClient.ventPåBatch(batch2Id, 'rapporter')
  const rapportResultater = await liveClient.hentBatchResultater(batch2Id)
  const rapportTokenForbruk = batchTokenForbrukFraResultater(batch2Id, rapportResultater)

  const langRapport = rapportResultater.get(`${slug}-lang-rapport`)?.innhold ?? 'Rapport mangler'
  const oppsummering = rapportResultater.get(`${slug}-oppsummering`)?.innhold ?? 'Oppsummering mangler'

  const rådata: AktorRådata = {
    aktor,
    timestamp: new Date().toISOString(),
    dimensjoner: DIMENSJONER.map((dim) => ({
      dimensjon: dim.id,
      dimensjonNavn: dim.navn,
      funn: dimensjonsResultater.get(`${slug}-${dim.id.toLowerCase()}`)?.innhold ?? 'Ingen funn',
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
    rOwner, rRepo, rBranchNavn,
    `raw-data/${slug}/research.json`,
    JSON.stringify(rådata, null, 2),
    `chore: legg til ISI-rådata for ${aktor.name}`,
  )

  const rPrUrl = await opprettPR(
    rOwner, rRepo, rBranchNavn, CONFIG.github.baseBranch,
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
    wOwner, wRepo, wBranchNavn,
    `src/content/aktorer/${slug}/rapport.md`,
    langRapport,
    `feat: legg til ISI-analyse for ${aktor.name}`,
  )
  await commitFil(
    wOwner, wRepo, wBranchNavn,
    `src/content/aktorer/${slug}/oversikt.md`,
    oppsummering,
    `feat: legg til ISI-oversikt for ${aktor.name}`,
  )

  const wPrUrl = await opprettPR(
    wOwner, wRepo, wBranchNavn, CONFIG.github.baseBranch,
    `ISI-analyse: ${aktor.name}`,
    `Automatisk generert ISI-analyse.\n\n- **Aktør:** ${aktor.name}\n- **Type:** ${aktor.type}${aktor.tilhørighet ? `\n- **Tilhørighet:** ${aktor.tilhørighet}` : ''}\n- **Dato:** ${dato}\n\n### Filer\n- \`rapport.md\` — fullstendig analytisk rapport\n- \`oversikt.md\` — oppsummering med score per underdimensjon\n\n### Kvalitetssikring\nSjekk at:\n- [ ] Alle 26 underdimensjoner er scoret\n- [ ] Kildehenvisninger er etterprøvbare\n- [ ] Konklusjonen er presis og ubetinget`,
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
