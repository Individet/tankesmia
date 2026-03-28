import * as fs from 'fs'
import * as path from 'path'
import { Aktor, DIMENSJONER } from './isi-rangering'

// ─── ISI-innhold (inlined fra skill-filer) ───────────────────────────────────

const ISI_RAMMEVERK = fs.readFileSync(
  path.resolve(__dirname, '../../skills/isi-scoring/references/ISI.md'),
  'utf8',
)

const ISI_TEMPLATE = fs.readFileSync(
  path.resolve(__dirname, '../../skills/isi-scoring/references/template.md'),
  'utf8',
)

export function lagDimensjonsAgentPrompt(
  dimensjon: (typeof DIMENSJONER)[0],
  aktor: Aktor,
): string {
  return `Du er en forskningsagent for tankesmien Individet.

Din eneste oppgave er å innhente evidens om hvorvidt aktøren **${aktor.name}** (${aktor.type}${aktor.tilhørighet ? `, ${aktor.tilhørighet}` : ''}) 
støtter opp under eller truer **${dimensjon.id}: ${dimensjon.navn}** ved sine ord eller tilknytninger.

## ISI-rammeverk (utdrag relevant for din dimensjon)

**Ikke-aggresjonsprinsippet (NAP)** fungerer som den operative testen:

- En aktør får **positiv indikatorverdi** ved å fremme frivillig samarbeid, forsvare individuelle rettigheter og begrense statlig tvang.
- En aktør får **negativ indikatorverdi** ved å initiere, forsvare eller normalisere tvang mot individer — uavhengig av intensjon.

## ${dimensjon.id}: ${dimensjon.navn}

${dimensjon.forankring}

${dimensjon.underdimensjoner
  .map(
    (u, i) => `### ${u}
  ${dimensjon.beskrivelser[i] ?? ''}`,
  )
  .join('\n')}

## Dokumentasjonskrav

1. Identifiser primærkilder (stemmegivning, partiprogram, uttalelse, kronikk)
2. Vurder konsistens over tid (ett enkelttilfelle vs. mønster)
3. Skill mellom _eksplisitt posisjon_ (høyere vekt) og _implisitt posisjon_ (lavere vekt)
4. Noter selvmotsigelser — inkonsistente aktører vurderes etter det overveiende mønsteret

**Eksempel — Politiker som støtter hatytringslover men motarbeider digital overvåkning:**

Intern inkonsistens noteres; aktøren viser selektiv frihetsorientering.

## Søkestrategi

${dimensjon.søkestrategi}

## Krav til output

Returner et strukturert JSON-objekt med følgende felt:
{
  "dimensjon": "${dimensjon.id}",
  "dimensjonNavn": "${dimensjon.navn}",
  "aktør": "${aktor.name}",
  "overordnetBeskrivelse": "Noen setninger om dimensjonens overordnede profil.",
  "funn": [
	{
	  "underdimensjon": "${dimensjon.id}.X",
	  "underdimensjonNavn": "Navn",
	  "posisjon": "eksplisitt|implisitt|ukjent",
	  "retning": "positiv|negativ|nøytral",
	  "styrke": "sterk|moderat|svak",
	  "beskrivelse": "En konsis beskrivelse av hva aktøren har gjort eller sagt angående underdimensjonen.",
	  "mønster": "Har aktøren hatt samme meninger om dette over tid?",
	  "inkonsistens": "Er det noen motstridende handlinger eller uttalelser?",
	  "kilder": ["URL eller tittel"]
	}
  ],
  "dataGaps": "Hvilke underdimensjoner mangler primærkilder?"
}

Returner KUN JSON. Ingen innledning, ingen markdown-blokker.`
}

export function lagLangRapportPrompt(aktor: Aktor): string {
  return `Du er en analytisk agent for tankesmien Individet.

Du skal skrive en fullstendig ISI-analyse av **${aktor.name}** (${aktor.type}${aktor.tilhørighet ? `, ${aktor.tilhørighet}` : ''}).

## ISI-rammeverk

${ISI_RAMMEVERK}

## Instruksjoner

Du mottar nå strukturerte forskningsfunn fra seks dimensjonsagenter. Bruk disse som eneste kildebase.

1. Sett indikatorverdi for alle 24 underdimensjoner (−2 til +2)
2. Beregn per-dimensjon-summer og totalverdi
3. Fyll ut template.md fullstendig — inkludert YAML frontmatter med alle felt
4. Ingresssetningen skal være ubetinget og presis — ingen forbehold
5. Konklusjonen skal si hva analysen faktisk viser

Normative regler som aldri kan fravikes:
- Intensjonsimmunitet: gode intensjoner hever ikke indikatorverdien
- Resultatuavhengighet: ISI måler frihet, ikke utfall
- Asymmetri: ikke juster skalaen for å unngå lave verdier

Returner den ferdig utfylte markdown-filen. Ingen kommentarer utenfor markdown.`
}

export function lagOppsummeringsPrompt(aktor: Aktor): string {
  return `Du er en analytisk agent for tankesmien Individet.

Du mottar den fullstendige ISI-analysen av **${aktor.name}**. 
Skriv en kortfattet oppsummeringsrapport som følger malen nøyaktig.

## ISI-rammeverk

${ISI_RAMMEVERK}

## Output-mal

${ISI_TEMPLATE}

## Krav

Rapporten skal inneholde:
1. YAML frontmatter med alle indikatorverdier (kopiert fra den lange rapporten)
2. Én-setnings ingress — aktørens kjerneprofil
3. Verditabell per dimensjon og totalt
4. Maks 3 kulepunkter: fremmer suverenitet
5. Maks 3 kulepunkter: hemmer suverenitet  
6. Én setning: nøkkelrisiko
7. ISI-klasse og totalverdi tydelig fremhevet

Oppsummeringen skal være selvstendig lesbar — ikke forutsette at leseren har sett langrapporten.
Maks 500 ord i brødtekst.

Returner markdown. Ingen kommentarer utenfor markdown.

`
}
