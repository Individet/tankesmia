# Forbedringer for isi-ranking pipeline

Dette dokumentet lister åpenbare feil og mangler i `isi-ranking`-pipelinen.

## Gjennomførte kvalitetsforbedringer (2026-05-03)

- **Evidence review oppgradert fra Haiku til Sonnet** (`constants.ts`): Evidence matrix er grunnlaget for scoring — dette var den tydeligste kvalitetsflaskehalsen.
- **Scoringskalibrering lagt til** (`prompts.ts`): Konkrete ankere for hva -2, -1, 0, +1, +2 betyr i praksis for ISI, med eksplisitte krav til ±2-bruk.
- **Konsistenssjekk-instruksjon i scoring** (`prompts.ts`): Modellen gjennomgår alle 24 scores som helhet og sjekker for indre inkonsistens, feilkalibrering og null-misbruk før den returnerer.
- **Filosofisk grunnlag i evidence harvest** (`prompts.ts`): Parent-dimensjonens navn og `philosophicalBasis` inkluderes nå i user-prompten, slik at harvest-agenten vet hvilken frihet den leter etter.
- **Flere web-søk per underdimensjon** (`02_evidence-harvest.ts`): max_uses økt fra 10 → 15.
- **Økt max_tokens for evidence harvest** (`02_evidence-harvest.ts`): 8000 → 12000.
- **Økt max_tokens for scoring** (`04_scoring-draft.ts`): 12000 → 16000.
- **Økt gap-research-mål** (`05_gap-research.ts`): Antall underdimensjoner per aktør økt fra 4 → 6, max_tokens 8000 → 12000.
- **Økt max_tokens for sluttrapport** (`06_final-report.ts`): 16000 → 20000.

## Tekniske feil og logiske mangler

- **Mangler sletting av gamle utdata**: `ensureDir(outputDir)` i `pipeline.ts` sjekker bare om mappen finnes. Hvis man kjører pipelinen på nytt med færre aktører eller endrede innstillinger, vil gamle filer fra forrige kjøring bli liggende og potensielt forvirre senere steg eller publisering.
- **Inkonsekvent bruk av modeller**: `constants.ts` definerer en liste med modeller (f.eks. `claude-sonnet-4-6`), men flere av disse navnene ser ut til å være plassholdere eller feilstavet (Anthropic bruker formater som `claude-3-5-sonnet-latest`).
- **Manglende feilhåndtering ved filinnlasting**: `loadFromDisk` kaster en generell feil hvis en fil mangler, men gir ingen mulighet for å fortsette hvis bare én aktør feiler i en batch-kjøring.
- **Problem ved gjenbruk av batch-IDer**: `pipeline.ts` lagrer `pipeline-state.json`, men sletter den aldri. Hvis man starter en ny kjøring i samme mappe, kan den prøve å gjenbruke batch-resultater fra en helt annen kjøring med andre aktører.
- **Hardkodet sti i `07_github-publish.ts`**: Pipelinen antar at `individet.github.io` ligger nøyaktig to nivåer opp og bort i filsystemet, noe som gjør den sårbar for endringer i workspace-struktur.
- **Manglende validering av JSON-output fra LLM**: Selv om det brukes typer, mangler det eksplisitt validering (f.eks. med Zod) før dataene skrives til disk i stegene 1-6. Dette kan føre til at korrupte JSON-filer stopper pipelinen halvveis.
- **Sårbarhet i path-building**: `buildPipelinePaths` i `utils.ts` (basert på bruken i `pipeline.ts`) ser ut til å stole på at `actorSlug` er en trygg streng, men det er ingen eksplisitt "slugify"-steg i `createActorDossier` som garanterer at navn med spesialtegn eller mellomrom ikke lager problematiske filstier på disk.
- **Dobbelt-lesing av filer**: I `runIsiRankingPipeline` leses manifest-filer (3 utgaver) og rammeverk-filer hver gang pipelinen starter, selv om man bare fortsetter fra et senere steg (`--from-step`).
