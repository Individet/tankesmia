# ISI ranking pipeline

Denne mappen inneholder en ny, flertrinns ISI-pipeline som er designet for aa vaere grundig og rimelig:

1. `00_actor-dossier.ts` lager lokale dossierer uten API-kall.
2. `01_research-plan.ts` lager researchplan per aktor med Sonnet 4.6.
3. `02_evidence-harvest.ts` henter evidens per underdimensjon med batch + web search.
4. `03_evidence-review.ts` dedupliserer og lager en evidence matrix.
5. `04_scoring-draft.ts` lager underdimensjonsscorer og pipelinen regner ut baade `ObservedScore` og `EstimatedScore` i kode.
6. `05_gap-research.ts` kjoerer ekstra research kun der scoreutkastet er svakt eller mangelfullt.
7. `06_final-report.ts` bruker Opus 4.6 kun til den endelige rapporten, etter at templaten er preutfylt programmatisk med metadata, scorer, datagap og kilder.

## Kjoring

```bash
npx tsx pipelines/isi-ranking/run-isi-ranking-pipeline.ts
```

Dry-run skriver request-payloads uten aa kalle Anthropic:

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
