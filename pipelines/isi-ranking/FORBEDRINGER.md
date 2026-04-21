# Forbedringer — isi-ranking

Gjennomgang av `pipelines/isi-ranking` sammenlignet med `pipelines/isi-rangering` og `skills/isi-scoring`.

---

## 1. Stavefeil og encoding-inkonsistenser

### 1.1 Norske tegn i `name`-felter (constants.ts)

Nesten alle `name`-felter i `SUBDIMENSIONS` bruker riktige norske tegn (æ, ø, å).
To unntak bryter mønsteret:

| Underdimensjon | Nå | Bør være |
|---|---|---|
| d3_4 | `Monetaer frihet` | `Monetær frihet` |
| d6_1 | `Overvaakning og personvern` | `Overvåkning og personvern` |

**Status:** ✅ Fikset som åpenbar skrivefeil.

### 1.2 `description`-felter mikser encoding fra d3_4 og utover

Fra d1_1 til d3_3 bruker `description`-feltene normale norske tegn (`ø`, `å`, `æ`).
Fra d3_4 og utover brukes ASCII-erstatninger (`aa`, `ae`, `oe`) — men *ikke konsekvent*.
Eksempler på blanding *innenfor samme streng*:

- d4_2: `'Har aktøren forsøkt aa paavirke domstolsavgjoerelser...'` — `ø` i `forsøkt`, men `aa` i `paavirke`
- d4_4: `'Støtter aktøren ... paa statsmakten ... noedrett?'` — `ø` i `Støtter`, men `aa` og `oe`
- d5_1: `'...religiøs praksis...'` — normal `ø`, mens nabofelter bruker ASCII

**Anbefaling:** Velg én linje — enten norske tegn overalt eller ASCII overalt. Inkonsistens forvirrer både utviklere og LLM-en som leser promptene.

### 1.3 Feil ASCII-erstatning: `omgaer` (constants.ts, d4_3)

```
'Støtter aktøren administrative sanksjoner eller tiltak som omgaer rettsprosessen?'
```

`omgaer` er verken korrekt norsk (`omgår`) eller gyldig ASCII-substitusjon (`omgaar`).

**Status:** ✅ Fikset som åpenbar skrivefeil.

### 1.4 Manglende `å` i actor-dossier (00_actor-dossier.ts:54)

```ts
period: actor.periode ?? 'Siste 3-5 ar'
```

Bør være `'Siste 3-5 år'`.

**Status:** ✅ Fikset som åpenbar skrivefeil.

### 1.5 `tilhorighet` i scoring.ts:84

```ts
'Imputert fra tilhorighet eller overordnet profil i scoringssteget.'
```

Bør være `tilhørighet`.

**Status:** ✅ Fikset som åpenbar skrivefeil.

### 1.6 Prompts mikser norske tegn og ASCII

`prompts.ts` har samme blanding. Noen eksempler:

- `buildResearchPlanSystemPrompt`: `primaerkilder` (ASCII) + `søk` (norsk ø) i *samme setning*
- `buildEvidenceHarvestSystemPrompt`: Konsekvent ASCII (`maalrettet`, `aa finne fa`)
- `buildScoringSystemPrompt`: `gjores` (mangler `ø` — bør være `gjøres` eller `gjoeres`)
- `buildFinalReportSystemPrompt`: Mest ASCII (`paa`, `aapenbar`), men `utelukkende` med normal `e`

**Anbefaling:** Gjør en gjennomgang og velg én strategi. Norske tegn fungerer fint i Anthropic API-er.

---

## 2. Inkonsistenser mot referansedokumenter

### 2.1 ISI.md definerer `0` annerledes enn pipeline og SKILL.md

| Kilde | Definisjon av `0` |
|---|---|
| `references/ISI.md` (linje 61) | "Nøytral, uklar posisjon eller ingen dokumentert standpunkt" |
| `skills/isi-scoring/SKILL.md` | "dokumentert blandet eller reelt balansert profil" |
| `isi-ranking` (scoringRulesText) | "dokumentert blandet eller balansert profil, ikke manglende data" |

**Problem:** ISI.md sendes til LLM-en som framework-context i research- og scoringsprompter. LLM-en får altså motstridende instruksjoner: rammeverket sier `0` = uklar/nøytral, mens scorereglene sier `0` = blandet profil og `null` = manglende data.

**Anbefaling:** Oppdater `references/ISI.md` skala-tabellen til å matche den nyere konvensjonen. Legg til `null` som eksplisitt verdi i tabellen.

### 2.2 Underdimensjonsnavn avviker litt fra template.md

| Subdim | isi-ranking (constants.ts) | template.md |
|---|---|---|
| d1_2 | "Sosial frihet og livsstilsautonomi" | "Sosial frihet/Livsstilsautonomi" |
| d5_3 | "Sivilsamfunn versus statlig substitusjon" | "Sivilsamfunn vs. statlig substitusjon" |

Ikke funksjonelt kritisk, men preutfylt metadata og Opus-generert tekst kan få ulike navn for samme underdimensjon.

**Status:** ✅ Fikset — constants.ts tilpasset template.md.

---

## 3. Inkonsistenser mellom PLAN.md og implementasjonen

### 3.1 Steg 04 output

PLAN.md sier output skal inkludere `cross-dimension-notes.md` som en separat fil. Implementasjonen skriver kun `score-draft.json` og `score-draft.md` (cross-dimension notes ligger inline i score-draft).

### 3.2 Steg 00 modell

PLAN.md sier "Haiku 4.5 eller ren kode". Implementasjonen bruker kun kode (ingen API-kall). PLAN bør oppdateres til å reflektere dette.

### 3.3 Eskaleringsmekanisme i steg 03

PLAN.md sier "Haiku 4.5 som standard, Sonnet 4.6 ved eskalering". Implementasjonen bruker kun Haiku. `MODELS.evidenceReviewEscalation` er definert (`claude-sonnet-4-6`) men aldri brukt.

---

## 4. Ubrukt / død kode

### 4.1 `executeBatchStep` i pipeline.ts

Funksjonen var definert men aldri kalt. Pipeline bruker inline transport-kall i stedet.

**Status:** ✅ Fjernet.

### 4.2 `_manifest` i pipeline.ts

Manifestfilen ble lest fra disk men brukt ikke:

```ts
const _manifest = await readTextFile(manifestFile)
```

**Status:** ✅ Fjernet.

### 4.3 `MODELS.evidenceReviewEscalation` i constants.ts

Definert men aldri importert eller brukt.

**Status:** ✅ Fjernet.

---

## 5. Typefeil / bugs

### 5.1 Stale Omit-type i 04_scoring-draft.ts (linje 22–31)

```ts
type PartialScoreDraft = Omit<
  ScoreDraft,
  | 'generatedAt'
  | 'dimensionSummaries'
  | 'evaluatedCount'    // ← finnes ikke på ScoreDraft
  | 'dataGapCount'
  | 'rawSum'            // ← finnes ikke
  | 'normalizedScore'   // ← finnes ikke
  | 'confidenceLevel'
>
```

`ScoreDraft` har feltene `observedCount`, `estimatedCount`, `observedRawSum`, `estimatedRawSum`, `observedScore`, `estimatedScore` — ikke `evaluatedCount`, `rawSum`, `normalizedScore`. TypeScript klager ikke på Omit av ikke-eksisterende felter, men typen unnlater å omitte de feltene som faktisk bør fjernes.

Konsekvens: Parsing med `parseJsonFromText<PartialScoreDraft>()` gjør en unsafe cast og maskerer feilen. Men type-kontrakten er feil.

**Status:** ✅ Fikset.

### 5.2 `any`-type i pipeline.ts

```ts
async function writeMatrices(
  outputDir: string,
  matrices: Map<string, any>,  // ← bør være Map<string, EvidenceMatrix>
)
```

**Status:** ✅ Fikset til `Map<string, EvidenceMatrix>`.

---

## 6. Forbedringspotensialer

### 6.1 `DEFAULT_ACTOR_FILE` peker på gammel pipeline

```ts
export const DEFAULT_ACTOR_FILE = 'pipelines\\isi-rangering\\actors.json'
```

Ny pipeline avhenger av at den gamle finnes. Flytt `actors.json` til et felles sted (f.eks. `data/`) eller til `isi-ranking/`.

**Status:** ✅ Kopiert til `data/actors.json`, `DEFAULT_ACTOR_FILE` oppdatert.

### 6.2 Gap-research kapper vilkårlig ved 6

`05_gap-research.ts` linje 41:

```ts
.slice(0, 6)
```

Maks 6 gap-targets per aktør uavhengig av alvorlighetsgrad. Vurder å prioritere etter confidence/datagap-nivå i stedet for å bare ta de 6 første.

### 6.3 `computeRawSum` behandler null som 0 / `estimatedScore` burde aldri være `null`

```ts
return subdimensions.reduce((sum, item) => sum + (item.score ?? 0), 0)
```

`observedRawSum` inkluderer null-scorer som 0, noe som trekker scoren mot 50. Dette er tilsiktet — `observedScore` er et full-range indeks der ukjent bidrar nøytralt.

`estimatedScore` per underdimensjon returnerte tidligere `null` når det ikke fantes nok grunnlag for imputering. Siden `estimatedScore` er ment å representere beste estimat, gir det mer mening å falle tilbake på `0` (nøytralt prior) fremfor `null` — aktøren er ukjent, ikke nødvendigvis nøytral, men `0` er rimeligste prior.

**Status:** ✅ `inferEstimatedScore` returnerer nå `0` som fallback i stedet for `null`. Rationale oppdatert til "For lite grunnlag — bruker nøytralt prior (0)."

### 6.4 Dossier-markdown bruker engelske labels

`dossierMarkdown()` bruker "Actor dossier", "Search aliases", "Likely domains", "Likely channels", "ISI dimensions" — mens resten av pipelinen er på norsk.

### 6.5 Source-type-klassifisering i sluttrapport er grov

`buildSourceLists` i `06_final-report.ts` klassifiserer en hel kilde som "primary" hvis *noe* funn i den artefakten er primary. En mer presis klassifisering ville vurdere per-sitering.

---

## 7. Sammenligning med gammel pipeline (`isi-rangering`)

### Hva ny pipeline gjør bedre

1. **Underdimensjonsvis research** (24 requests per aktør) i stedet for 6 brede dimensjonsforespørsler — mye mer presis
2. **Evidence matrix** som mellomsteg gir Opus kuratert, strukturert input
3. **ObservedScore / EstimatedScore** beregnes i kode før Opus får dem — eliminerer LLM-matematikk
4. **Korrekt antall underdimensjoner** (24). Gammel pipeline sier "26" i `lagLangRapportPrompt` (linje 99)
5. **Sonnet til research, Opus kun til sluttrapport** — bedre kvalitet-per-krone
6. **Nyere web search API** (`web_search_20260209` + `code_execution`)
7. **Transparent imputeringsmekanisme** med sporing av basis og begrunnelse
8. **Preutfylt template** med YAML frontmatter — Opus slipper å generere metadata

### Hva gammel pipeline har som ny mangler

1. **Gemini-provider som alternativ** (`01_search_pipeline_gemini.ts`, `00_create_profile_gemini.ts`)
2. **GitHub-publisering** (`03_save_reports.ts`) — ✅ Innført som `07_github-publish.ts`, kjører automatisk. Hopper over stille hvis `GITHUB_TOKEN` mangler.
3. **Enkeltstegs-kjøring** (`run-isi-step.ts`) — ny pipeline kjører bare hele flyten
4. **Detaljert søkestrategi per dimensjon** i prompts — **ikke nødvendig i ny pipeline**: steg 01 (research plan) genererer allerede aktørspesifikke søkespørringer per underdimensjon, og Sonnet 4.6 + `web_search_20260209` er langt mer kapabelt enn Haiku 4.5 med statiske søkeord. Hardkodede søkestrategier ville gitt liten gevinst og låst pipelinen til kjente aktørtyper.

---

## 8. Oppsummering av fikser gjort

| Hva | Fil | Endring |
|---|---|---|
| `Monetaer` → `Monetær` | constants.ts | Rettet i `name`-felt |
| `Overvaakning` → `Overvåkning` | constants.ts | Rettet i `name`-felt |
| `omgaer` → `omgår` | constants.ts | Rettet ugyldig ASCII-erstatning |
| Norske tegn i alle `description`-felter | constants.ts | Rettet alle ASCII-erstatninger fra d3_4 og utover |
| Norske tegn i alle prompts | prompts.ts | Rettet `primaerkilder`, `maalrettet`, `aa finne fa`, `soek`, `soekehints`, `evidensredaktoer`, `gjores etterpaa`, `oppfoelgingsrunde`, `Kjoer`, `paa nytt`, `aapenbar` m.fl. |
| `0` definisjon i ISI.md | skills/isi-scoring/references/ISI.md | Endret fra "Nøytral/uklar" til "Dokumentert blandet/balansert". Lagt til `null`-rad med datagap-definisjon |
| `Siste 3-5 ar` → `Siste 3-5 år` | 00_actor-dossier.ts | Rettet manglende `å` |
| `tilhorighet` → `tilhørighet` | scoring.ts | Rettet manglende `ø` |
| Stale Omit-type | 04_scoring-draft.ts | Rettet feltnavn i PartialScoreDraft |
| GitHub-publisering | 07_github-publish.ts (ny) | Portert fra gammel pipeline, tilpasset ny arkitektur |
