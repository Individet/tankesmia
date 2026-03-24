# ISI-rangering pipeline

Automatisk genererer ISI-analyserapporter for politiske aktører og publiserer dem til GitHub.

## Hva den gjør

For hver aktør i `actors.json`:

1. **Forskning** — 6 agenter kjøres parallelt (én per frihetsdimensjon) med web-søk og returnerer strukturert JSON
2. **Rapportering** — 2 agenter skriver fullstendig rapport og kortoppsummering basert på funnene
3. **Publisering** — oppretter to pull requests på GitHub:
   - `isi-rådata`: rådata som JSON (`raw-data/{slug}/research.json`)
   - `individets-suverenitet`: markdown-rapporter (`src/content/aktorer/{slug}/rapport.md` + `oversikt.md`)

## Slik kjører du den

```bash
ANTHROPIC_API_KEY=... GITHUB_TOKEN=... npx tsx run-isi-pipeline.ts actors.json
```

## Aktør-format (`actors.json`)

```json
[
  {
    "name": "Jonas Gahr Støre",
    "type": "politiker",
    "tilhørighet": "Arbeiderpartiet",
    "jurisdiksjon": "Norge",
    "periode": "2021–"
  }
]
```

## De seks dimensjonene

| ID | Navn |
|----|------|
| D1 | Kroppslig autonomi og selvbestemmelse |
| D2 | Ytringsfrihet og intellektuell autonomi |
| D3 | Eiendomsrett og økonomisk frihet |
| D4 | Rettsstat og likebehandling |
| D5 | Forenings-, forsamlings- og religionsfrihet |
| D6 | Digital autonomi og informasjonsfrihet |

Hver dimensjon har 4–5 underdimensjoner som scores fra −2 til +2.

## Filstruktur

```
isi-rangering/
├── run-isi-pipeline.ts    # Inngangspunkt (CLI)
├── isi-rangering.ts       # Pipeline-orkestrering
├── config.ts              # Modeller, GitHub-repos, polling
├── dimensjoner.ts         # De 6 frihetsdimensjonene med beskrivelser
├── github.ts              # GitHub API-wrapper (branch, commit, PR)
├── prompts.ts             # Prompt-maler for research- og rapport-agentene
├── anthropic-live.ts      # Anthropic Batch API-wrapper
└── isi-rangering.main.test.ts  # Integrasjonstest
```
