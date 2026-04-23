# Notat-pipeline

Automatisert pipeline for å skrive Individet-notater.

## Konsept

Pipelinen tar et tema og en beskrivelse som input, og produserer et ferdig
Individet-notat i tre steg:

| Steg | Agent | Modell | Oppgave |
|------|-------|--------|---------|
| 1 | Forsker | Claude Sonnet | Tenker rundt temaet, lager strukturert forskningsplan med delspørsmål og søkestrategi |
| 2 | Evidens-agenter | Claude Haiku | Parallelle web-søk for hvert forskningsområde, samler empirisk grunnlag |
| 3 | Skribent | Claude Opus 4.6 | Skriver det ferdige notatet basert på forskning og manifest |

## Kickstart

Lag eller rediger `data/notat-input.json`:

```json
{
  "tema": "Demoniseringen av individet på grunnskolen",
  "beskrivelse": "Norsk grunnskole fremstiller i stadig større grad individuelle valg...",
  "year": 2026,
  "number": "06"
}
```

Feltene `year` og `number` er valgfrie. Hvis de mangler brukes inneværende år
og `"XX"` som nummer.

## Kjøring

```bash
npx tsx pipelines/notat/run-notat-pipeline.ts
```

Dry-run skriver request-payloads uten å kalle Anthropic:

```bash
npx tsx pipelines/notat/run-notat-pipeline.ts --dry-run
```

Hopp over tidlige steg (last fra disk):

```bash
FROM_STEP=3 npx tsx pipelines/notat/run-notat-pipeline.ts
```

Egendefinert inputfil:

```bash
npx tsx pipelines/notat/run-notat-pipeline.ts data/mitt-notat.json
```

## Output

Standardmappe: `output/notat/{notat-slug}/`

| Fil | Innhold |
|-----|---------|
| `notat-input.json` | Kopi av inputen |
| `research-plan.json` | Strukturert forskningsplan fra forsker-agenten |
| `research-plan.md` | Lesbar versjon av forskningsplanen |
| `evidence/{area-id}.json` | Evidens per forskningsområde |
| `evidence/{area-id}.md` | Lesbar versjon av evidensen |
| `notat.md` | Det ferdige notatet med YAML frontmatter |
| `pipeline-state.json` | Batch-IDer for resumé |

## Publisering

Når pipelinen er ferdig publiseres:
- **Notatet** (`notat.md`) som pull request til
  `Individet/individet.github.io` under `content/notater/{slug}.md`
- **Rådata** (alle output-filer) til `Individet/r-data` under `notat/{slug}/`

Krever `GITHUB_TOKEN` som miljøvariabel.

## Modeller og kostnader

Pipelinen bruker bevisst ulike modeller per steg:

- **Sonnet** for forsker-steget: god balanse mellom tenkeevne og kostnad
- **Haiku** for evidensinnsamling: billig og rask for enkle søk
- **Opus 4.6** for skriving: beste tilgjengelige modell for selve notatet

Et typisk notat bruker:
- 1 Sonnet-batch-request (forskningsplan)
- 5–8 Haiku-batch-requests (evidens per område)
- 1 Opus-batch-request (selve notatet)

## Testing

```bash
npx vitest run pipelines/notat
```
