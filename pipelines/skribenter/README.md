# Skribent-pipeline

Bygger og vedlikeholder én profilside per frihetsorientert norsk skribent, pluss
en oversiktsside over alle, til `individet.no/skribenter/`.

Hver profilside har:

- bilde, navn og en kort linje (yrke, tilknytning)
- personens egne kanaler (hjemmeside, Substack, SoMe) og andre lenker (Wikipedia o.l.)
- en fritt formulert tekst om hvem personen er og hvordan de bidrar til å forsvare
  individets frihet, tilpasset personen
- alle registrerte tekster av personen, kronologisk og gruppert per år

## Hovedidé: gjør minst mulig

Pipelinen kjøres hver uke, men en uke der ingenting har skjedd koster nesten
ingenting. Hver skribent går gjennom en trapp, og stopper på første trinn som
kan avgjøre saken:

| Trinn | Kostnad | Hva skjer |
|---|---|---|
| 0. Feeds | gratis | RSS/Atom-feeder i registeret sjekkes for nye tekster. |
| 1a. Triage | gratis | Ingen profil, endret registeroppføring, ny sidemal (`PROFILE_TEMPLATE_VERSION`), profil eldre enn 180 dager eller `--force` gir **full**. Sjekket for under 5 dager siden og ingenting nytt i feed gir **skip**. Avdøde skribenter får aldri endringssjekk. |
| 1b. Endringssjekk | Haiku, ≤ 4 søk | «Har noe NYTT skjedd siden {dato}?» Modellen får lista over kjente tekster og svarer med nye tekster og hendelser (`high`/`low`). |
| 1c. Beslutning | gratis | Vesentlig hendelse eller ≥ 5 nye tekster gir **full**. 1–4 nye tekster gir **update-list**. Ellers **skip**. |
| 2. Research | Sonnet, ≤ 15 søk | Kun for **full**. Får forrige profil og kjente tekster, og leter bare etter det som er nytt. |
| 3. Profiltekst | Opus | Kun for **full**. Får forrige versjon og oppdaterer den. |

Tre utfall per skribent:

- **skip**: siden står urørt.
- **update-list**: tekstlista oppdateres, men profilteksten beholdes. Tekstlista
  rendres av kode, ikke av LLM, så dette krever ingen modell.
- **full**: ny research og ny profiltekst.

Hendelser som allerede er tatt hensyn til (`knownEvents`) utløser ikke noe på
nytt. Tekster dedupliseres på normalisert URL, eller på tittel og år.

Feiler endringssjekk, research eller skriving for én skribent, beholdes den
gamle profilen. Resten av kjøringen fortsetter.

## Filer

| Fil | Innhold |
|---|---|
| `data/skribenter.json` | Registeret: id (= slug), navn, beskrivelse, `identification` (skiller personen fra navnebrødre), kjente lenker og feeds. |
| `decide.ts` | All beslutningslogikk (rene funksjoner, godt testet). |
| `feeds.ts` | Minimal RSS/Atom-parser. |
| `01_change-check.ts`, `02_research.ts`, `03_write-profile.ts` | De tre LLM-stegene (Message Batches, 50 % rabatt). |
| `render.ts` | Setter sammen profilside og `_index.md` deterministisk. Bare brødteksten kommer fra LLM. |
| `store.ts` | Tilstand per skribent: lokalt, eller i `Individet/r-data` under `skribenter/{id}/`. |
| `github.ts` | Publisering: én PR mot `Individet/individet.github.io`. |

## Tilstand og publisering

Tilstanden (`state.json`, `profile.json`, `profiltekst.md` og bilde) lagres i
`Individet/r-data/skribenter/{id}/`, slik at den overlever mellom CI-kjøringer.

Nettsiden får én samlet PR per kjøring:

- `content/skribenter/{id}.md`: profilsidene
- `content/skribenter/_index.md`: oversiktssiden
- `static/img/skribenter/{id}.{ext}`: nedlastede profilbilder

Alle sider rendres hver gang, og filer som er identiske med `main` filtreres
bort. Er ingenting endret, lages ingen PR. En side som mangler fordi en
tidligere PR aldri ble flettet, kommer automatisk med i neste PR. Hver PR
inneholder hele differansen mot `main`, så en eldre, uflettet
skribent-PR kan lukkes når en ny kommer.

## Kjøring

```bash
# Tørrkjøring: viser beslutninger og skriver request-payloads, ingen LLM-kall
npm run skribenter:dry -- --local

# Lokal kjøring (tilstand i output/skribenter/state, ingen publisering)
npm run skribenter -- --local

# Bare noen skribenter / tving ny profil
npm run skribenter -- --only=vegard-martinsen,jan-arild-snoen
npm run skribenter -- --force=jan-brogger
npm run skribenter -- --force            # alle
```

Med `GITHUB_TOKEN` eller `GITHUB_APP_*` satt (og uten `--local`) leses og
skrives tilstanden i `r-data`, og nettsiden får en PR. I CI kjører
`.github/workflows/oppdater-skribenter.yml` hver mandag, og kan også startes
manuelt med `only`/`force`.

Etter hver kjøring ligger `output/skribenter/run-report.md` med beslutning og
begrunnelse per skribent. I CI legges den også i jobbsammendraget.

## Legge til eller endre en skribent

Legg til en oppføring i `data/skribenter.json`. `id` er slug og skal aldri
endres etter publisering. Fyll ut `identification` godt, og legg til
`feeds` hvis personen har RSS (Substack: `https://navn.substack.com/feed`,
WordPress: `…/author/navn/feed/`). Feeds gjør at nye tekster fanges opp gratis.

En endring i en eksisterende oppføring (utenom `enabled`) gir automatisk ny
full profil ved neste kjøring. `"enabled": false` tar en skribent ut uten å
slette tilstanden.

## Testing

```bash
npx vitest run pipelines/skribenter
```

## Forutsetninger på nettsiden

Pipelinen antar at nettsiden (Hugo) har en `skribenter`-seksjon, og at
malene bruker `title`, `description`, `image` og `themes` fra frontmatter.
Sidene er gyldig markdown også uten egne maler.
