# ISI ranking pipeline

Flertrinns pipeline for å score og rangere politiske aktører etter ISI-rammeverket (Individuell Selvbestemmelse og Frihet). Pipelinen er designet for å være grundig og kostnadseffektiv ved å bruke billigere modeller til research og spare Opus til sluttrapportene.

## Trinn 0 – Aktørdossier

`00_actor-dossier.ts` kompilerer et strukturert dossier for hver aktør fra inndata-JSON. Dette trinnet gjør ingen API-kall og produserer `actor-dossier.json` som brukes i alle påfølgende trinn.

- **Modell:** ingen
- **Tools:** ingen

## Trinn 1 – Forskningsplan

`01_research-plan.ts` lager en prioritert kildeplan per aktør. Modellen vurderer hvilke primær- og sekundærkilder som er mest relevante for å belyse aktørens ISI-standpunkter, og produserer en `research-plan.json` som styrer bevisinnsamlingen.

- **Modell:** `claude-sonnet-4-6`
- **Tools:** `web_search` (maks **10** kall per aktør), `code_execution`

## Trinn 2 – Bevisinnsamling

`02_evidence-harvest.ts` sender ett Anthropic-batch-kall per underdimensjon per aktør (24 underdimensjoner × N aktører). Hvert kall gjør websøk og samler sitater, URLer og sammendrag som lagres som individuelle `evidence/<underdimensjon>.json`-filer.

- **Modell:** `claude-sonnet-4-6`
- **Tools:** `web_search` (maks **10** kall per kall, dvs. per underdimensjon), `code_execution`

## Trinn 3 – Evidensmatrise

`03_evidence-review.ts` dedupliserer og konsoliderer all innsamlet evidens til en kompakt `evidence-matrix.json` per aktør. Matrisen gjør det lettere å vurdere dekningsgrad og identifisere hull før scoring.

- **Modell:** `claude-haiku-4-5`
- **Tools:** ingen

## Trinn 4 – Scoring-utkast

`04_scoring-draft.ts` ber modellen sette en score (−2 til +2, eller `null`) per underdimensjon basert på evidensmatrisen. Pipelinen regner deretter selv ut `ObservedScore` og `EstimatedScore` (0–100) i kode, slik at Opus har tallene klare til sluttrapporten.

- **Modell:** `claude-sonnet-4-6`
- **Tools:** ingen

## Trinn 5–7 – Gap-research og oppdatert scoring (valgfritt)

`05_gap-research.ts` identifiserer underdimensjoner med svak eller manglende evidens (maks 6 per aktør) og kjører målrettede oppfølgingssøk. Deretter kjøres trinn 3 og 4 på nytt med den berikede evidensen, slik at scorene er best mulig fundert før sluttrapport. Hele steg 5–7 hoppes over hvis `--skip-gap-research` er satt.

- **Modell:** `claude-sonnet-4-6` (trinn 5 og 7), `claude-haiku-4-5` (trinn 6)
- **Tools (trinn 5):** `web_search` (maks **10** kall per gap-kall), `code_execution`
- **Tools (trinn 6–7):** ingen

## Trinn 8 – Sluttrapport

`06_final-report.ts` bruker Opus til å skrive den endelige rapporten. Templaten er preutfylt programmatisk med dossier, scorer, evidens og datagap, så Opus konsentrerer seg om analyse og formulering – ikke datagjenfinning.

- **Modell:** `claude-opus-4-6`
- **Tools:** ingen

## Trinn 9 – GitHub-publisering

`07_github-publish.ts` pusher ferdig rapport (`rapport.md`) til nettstedsrepoet og rådata til datarepoet via GitHub API, og åpner en pull request klar for gjennomgang.

- **Modell:** ingen (GitHub API via Octokit)
- **Tools:** ingen

## Kjøring

```bash
npx tsx pipelines/isi-ranking/run-isi-ranking-pipeline.ts
```

Dry-run skriver request-payloads uten å kalle Anthropic:

```bash
npx tsx pipelines/isi-ranking/run-isi-ranking-pipeline.ts --dry-run
```

## Output

Standard outputmappe er `output/isi-ranking/<actor-slug>/`.

Viktige artefakter:

- `actor-dossier.json`
- `research-plan.json`
- `evidence/*.json`
- `evidence-matrix.json`
- `score-draft.json`
- `rapport.md`
