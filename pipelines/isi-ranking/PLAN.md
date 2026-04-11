# Plan for `pipelines/isi-ranking`

## Mål

Lage en ny ISI-ranking-pipeline som er **minst like god som Claude Opus 4.6 i Deep Research**, men til **lavest mulig kostnad** ved å:

- bruke **Anthropic Messages Batch API** overalt der svartid ikke er kritisk
- bruke **Sonnet 4.6** til research og kvalitetskontroll
- bruke **Haiku 4.5** til billige, mekaniske transformasjoner
- bruke **Opus 4.6 kun i siste steg**, når den faktiske slutt-rapporten skrives

## Hvorfor dagens `pipelines/isi-rangering` taper mot Deep Research

### 1. Researchen er for komprimert, for tidlig

Dagens pipeline går direkte fra:

1. en kort profil
2. seks brede dimensjonsforespørsler
3. én sluttrapport

Det betyr at Opus i slutten arbeider på **andrehåndssammendrag**, ikke på et kuratert kildegrunnlag. Deep Research er bedre fordi modellen får iterere, sortere, forkaste svake treff og bevare flere mellomliggende funn.

### 2. Feil modell gjør det dyreste arbeidet billigst

Nåværende research-steg bruker i praksis **Haiku 4.5** til oppgaver som krever:

- kildeprioritering
- søkestrategi
- konfliktvurdering
- historisk mønstergjenkjenning
- eksplisitt vs. implisitt posisjon

Dette er nettopp den typen arbeid hvor Sonnet 4.6 er mye bedre per krone enn Haiku, mens Opus bør spares til siste syntese.

### 3. Gammel web search-stack

Pipelinen bruker `web_search_20250305`. Anthropic-dokumentasjonen beskriver at nyere `web_search_20260209` med **dynamic filtering** gir bedre kvalitet og lavere tokenbruk, særlig for teknisk og dokumenttung research. Dagens pipeline bruker heller ikke `code_execution`, og mister dermed filtreringsgevinsten.

### 4. For brede research-jobs

Én request per dimensjon dekker fire underdimensjoner, mange mulige kildetyper og et helt ideologisk spenn. Det gjør at modellen:

- bruker søk på feil steder
- overgenererer tekst for å dekke alt
- mister presisjon per underdimensjon
- fyller hull med vag prosa i stedet for eksplisitte datagap

### 5. Fast søkebudsjett gir støy

Instruksjonen om et fast antall søk per underdimensjon/dimensjon presser modellen til å lete videre selv når evidensen allerede er god nok, og til å skrive noe også når evidensen er svak. Deep Research oppfører seg mer adaptivt.

### 6. Sluttrapporten får feil input-format

Opus får i dag syv markdown-filer med blanding av:

- fortolkning
- sitater
- fotnoter
- løse kildelister

Det er et dårligere beslutningsgrunnlag enn en eksplisitt **evidence matrix** med:

- påstand
- underdimensjon
- evidensnivå
- kildeklasse
- sitat
- dato
- konflikt/notat

### 7. Instruksjonskonflikter må fjernes helt

Den nye pipelinen må låse følgende regler tidlig og konsekvent:

- det finnes **24 underdimensjoner**, ikke 26
- hver underdimensjon får en score i **`-2` til `+2`, eller `null`**
- **`null`** betyr manglende eller utilstrekkelig datagrunnlag
- **`0`** betyr at aktøren har en dokumentert **blandet / reelt balansert** profil på underdimensjonen, ikke manglende data
- research-artefakter skal bevare **URL-er, titler og sitater** strukturert, men LLM-en skal ikke bruke plass på å diktere URL-er på nytt i fri tekst når de allerede finnes maskinelt
- den endelige **sluttscoren** skal regnes ut av pipelinen **før** Opus skriver rapporten

Sluttscoren bør normaliseres til **0-100**, der:

- **0** = `-2` på alle 24 underdimensjoner
- **100** = `+2` på alle 24 underdimensjoner

Praktisk formel:

`normalizedScore = round(((sum(scores) - minPossible) / (maxPossible - minPossible)) * 100)`

der:

- `sum(scores)` summerer kun de 24 underdimensjonene
- `minPossible = -48`
- `maxPossible = 48`

Hvis én eller flere underdimensjoner er `null`, må pipelinen i tillegg beregne:

- antall vurderte underdimensjoner
- antall datagap
- confidence level

og gi Opus både rå underdimensjonsscorer og den ferdig beregnede normaliserte totalscoren. Da slipper Opus å gjette matematikk eller score-semantikk.

### 8. Cache-strategien er svak for batch-kjøring

Store, gjentatte blokker som ISI-rammeverk, template og kildepolicy blir sendt om igjen uten en tydelig cache-strategi designet for batch. Anthropic anbefaler delt cachebart prefiks og gjerne lengre cache-vindu for batcharbeid.

## Designprinsipper for ny pipeline

1. **Bevar evidens lengst mulig.** Ikke skriv lange sammendrag før kildene er destillert til en strukturert evidenspakke.
2. **Skill research fra forfatting.** Research finner og normaliserer funn; sluttsteget skriver rapport.
3. **Bruk adaptiv eskalering.** Kjør flere søk bare når evidensen er svak, motstridende eller hullene er viktige.
4. **Bruk billigste modell som fortsatt er god nok for deloppgaven.**
5. **Gi Opus et rent, lite, høykvalitets beslutningsgrunnlag.**
6. **Sørg for revisjonsspor.** Hver score skal kunne spores tilbake til en konkret evidenspakke.

## Foreslått pipeline

## Steg 00 — `00_actor-dossier.ts`

**Modell:** Haiku 4.5 eller ren kode  
**Batch:** Ja

Formål:

- normalisere aktørmetadata
- lage aliaser, navnevarianter, parti/organisasjonstilknytning
- hente ut analyseperiode, jurisdiksjon og relevante publiseringsarenaer

Output:

- `actor-dossier.json`

Dette bør være billig og mest mulig deterministisk. Ikke bruk dyr modell her hvis enkel regelkode er nok.

## Steg 01 — `01_research-plan.ts`

**Modell:** Sonnet 4.6  
**Verktøy:** `web_search_20260209` + `code_execution`  
**Batch:** Ja, én request per aktør

Formål:

- lage en **research plan** før selve innhøstingen
- identifisere hvilke underdimensjoner som sannsynligvis har rik dekning
- prioritere kildetyper og domener
- definere søketermer og negative søkeord

Output:

- `research-plan.json`
- `source-priority.md`

Dette erstatter dagens brede `profil.md`. Profiltekst alene er ikke nok; vi trenger et eksplisitt søkekart.

## Steg 02 — `02_evidence-harvest.ts`

**Modell:** Sonnet 4.6  
**Verktøy:** `web_search_20260209` + `code_execution`  
**Batch:** Ja

Formål:

- kjøre **målrettet research per underdimensjon**, ikke bare per dimensjon
- samle 1–5 gode evidenspunkter per underdimensjon
- stoppe tidlig når evidensen er tilstrekkelig
- flagge datagap eksplisitt når gode kilder ikke finnes

Anbefalt enhet:

- primært **24 requests per aktør** (én per underdimensjon)
- men styrt av research-planen, slik at svakere/irrelevante områder får mindre budsjett

Output per underdimensjon:

- `evidence/d1_1.md`
- `evidence/d1_1.json`

Hver evidensfil bør ha et fast skjema:

- underdimensjon
- hovedpåstand
- eksplisitt / implisitt / ukjent
- positiv / negativ / blandet / utilstrekkelig grunnlag
- kildeklasse (primær, sekundær)
- 1–3 nøkkelsitater
- URL, tittel, dato
- notat om konflikt eller usikkerhet

URL-er skal altså lagres eksplisitt i strukturerte felter, men ikke nødvendigvis gjentas i løpende analyseprosa.

## Steg 03 — `03_evidence-review.ts`

**Modell:** Haiku 4.5 som standard, Sonnet 4.6 ved eskalering  
**Batch:** Ja

Formål:

- deduplisere funn
- rangere evidens etter kvalitet
- forkaste svake eller irrelevante treff
- oppdage konflikt mellom kilder
- sikre at hver underdimensjon ender med en liten, ren evidenspakke

Output:

- `evidence-matrix.json`
- `evidence-matrix.md`

Dette er nøkkelsteget som dagens pipeline mangler. Opus skal ikke lese rå støy; Opus skal lese en kuratert matrise.

## Steg 04 — `04_scoring-draft.ts`

**Modell:** Sonnet 4.6  
**Batch:** Ja

Formål:

- lage et **foreløpig scoreutkast** for alle 24 underdimensjoner
- skrive kort begrunnelse per score
- merke hvert punkt som `high_confidence`, `medium_confidence` eller `data_gap`
- identifisere interne inkonsistenser på tvers av dimensjoner
- regne ut den endelige **normaliserte totalscoren (0-100)** før rapportsteget

Scoreregel per underdimensjon:

- `-2` til `+2` når det finnes nok grunnlag til å vurdere posisjonen
- `0` når evidensen peker i blandet retning og nettoresultatet reelt er balansert
- `null` når grunnlaget er utilstrekkelig

Output:

- `score-draft.json`
- `cross-dimension-notes.md`

`score-draft.json` bør minst inneholde:

- alle 24 underdimensjonsscorer
- per-dimensjon summer eller delsummer for intern bruk
- `evaluatedCount`
- `dataGapCount`
- `rawSum`
- `normalizedScore`
- `confidenceLevel`

Viktig: dette er **ikke** den endelige rapporten. Dette er beslutningsgrunnlaget Opus skal bruke.

## Steg 05 — `05_gap-research.ts`

**Modell:** Sonnet 4.6  
**Verktøy:** `web_search_20260209` + `code_execution`  
**Batch:** Ja, kun for eskalerte hull

Formål:

- kjøre ekstra research bare der:
  - evidensen er motstridende
  - et viktig spørsmål mangler primærkilde
  - scoreutkastet er lavt/labilt begrunnet

Output:

- oppdaterte evidensfiler
- `gap-resolution.json`

Dette er den billigste måten å etterligne Deep Research på: **iterasjon bare der det faktisk trengs**.

## Steg 06 — `06_final-report.ts`

**Modell:** Opus 4.6  
**Batch:** Ja  
**Opus brukes kun her**

Input:

- `actor-dossier.json`
- `evidence-matrix.json`
- `score-draft.json`
- `cross-dimension-notes.md`
- `skills/isi-scoring/references/ISI.md`
- `skills/isi-scoring/references/template.md`

Formål:

- skrive den endelige rapporten i korrekt markdown-format
- fylle YAML frontmatter riktig
- formulere ingress, vurderinger og konklusjon med høy presisjon
- holde seg strengt til den kuraterte evidensen
- bruke den **ferdig beregnede** `normalizedScore` fra pipelinen, ikke regne totalscoren selv

Output:

- `rapport.md`

## Anthropic-API-oppsett

### Må brukes

- **Messages Batch API** for alle steg
- **prompt caching** for delt prefiks:
  - ISI-rammeverk
  - template
  - kildepolicy
  - output-skjema
- **`web_search_20260209`**
- **`code_execution`** for dynamic filtering i research-stegene

### Bør brukes

- dokumentbaserte input-pakker i sluttsteget, slik at Opus leser rene artefakter fremfor sammenklistret markdown
- eksplisitte cache breakpoints på den siste statiske blokken
- eventuelt lengre cache-vindu når batcher kjøres over lengre tid

### Bør unngås

- Opus i research-leddene
- Haiku til konfliktvurdering og kildeprioritering
- brede fritekst-sammendrag som eneste input til neste steg
- faste søkekvoter som ikke tar hensyn til evidensmetning

## Billigste modellfordeling som fortsatt bør gi høy kvalitet

| Oppgave | Modell | Hvorfor |
| --- | --- | --- |
| Metadata, aliaser, filpakking | Haiku 4.5 / kode | Billig, mekanisk arbeid |
| Research-plan | Sonnet 4.6 | Bedre søkestrategi og avgrensning |
| Evidensinnhøsting | Sonnet 4.6 | Dynamic filtering + bedre kildevalg |
| Dedupe og evidensrangering | Haiku 4.5, evt. Sonnet ved tvil | Mesteparten er mekanisk, men tvilstilfeller kan eskaleres |
| Scoreutkast | Sonnet 4.6 | Trenger dømmekraft, men ikke Opus |
| Sluttrapport | Opus 4.6 | Beste språk, nyansering og sluttlig syntese |

## Konkret forbedring fra dagens pipeline

Den nye pipelinen bør erstatte:

- `profil.md` som bred fortekst  
med:
- `actor-dossier.json` + `research-plan.json`

Den bør erstatte:

- seks store `d1-search.md ... d6-search.md`  
med:
- 24 små evidenspakker + én `evidence-matrix.json`

Den bør erstatte:

- én sluttprompt som både må tolke, score og skrive  
med:
- scoreutkast først, rapportforfatting etterpå

## Evalueringskriterier

Den nye pipelinen er god nok først når den:

1. finner flere primærkilder enn dagens pipeline på samme aktør
2. gir færre vage formuleringer og færre udokumenterte påstander
3. markerer datagap eksplisitt i stedet for å fylle med luft
4. håndterer inkonsistens mellom kilder bedre
5. produserer rapporter som krever mindre manuell etterredigering
6. holder total kostnad klart under en full Opus Deep Research-prosess per aktør

## Implementeringsrekkefølge

1. Opprett ny felles typestruktur for `actor-dossier`, `research-plan`, `evidence-item`, `evidence-matrix` og `score-draft`.
2. Lag ett felles Anthropic-klientlag for batch, polling, cache-oppsett og artefaktpersistens.
3. Implementer steg 00 og 01 først, slik at research-planen blir eksplisitt.
4. Implementer steg 02 med underdimensjonsvis research.
5. Implementer steg 03 og 04 før sluttprompten skrives.
6. Implementer steg 05 som adaptiv eskalering, ikke som obligatorisk steg.
7. Implementer steg 06 til slutt, med streng input-kontrakt mot evidensmatrisen.
8. Lag side-om-side-evaluering mot minst noen eksisterende aktører for å sammenligne kvalitet og kostnad.

## Viktigste beslutning

Hvis målet er å matche Deep Research-kvalitet billigst mulig, er den riktige strategien **ikke** å bruke mer Opus tidligere. Den riktige strategien er å:

- bruke **Sonnet 4.6 til research**
- bruke **batch + caching**
- gjøre researchen **smalere og mer strukturert**
- la **Opus 4.6 kun skrive sluttrapporten fra et mye bedre beslutningsgrunnlag**
