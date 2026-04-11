# Prompt-audit: isi-ranking pipeline

Gjennomgang av alle prompts i `pipelines/isi-ranking`, vurdert etter tre kriterier:

1. **Kontekstkomplethet** — Har agenten nok kunnskap til å gjøre jobben riktig?
2. **Utvetydighet** — Er instruksene presise, uten rom for feiltolking?
3. **Haiku-robusthet** — Er prompts til Haiku lange, positivt formulert, med eksempler?

---

## Modellkart

| Steg | Prompt-funksjon | Modell | Får ISI.md | Får manifest | Returnerer |
|---|---|---|---|---|---|
| 1 Forskningsplan | `buildResearchPlanSystemPrompt` | Sonnet | ✅ | ❌ | JSON |
| 2 Bevisinnsamling | `buildEvidenceHarvestSystemPrompt` | Sonnet | ✅ | ❌ | JSON |
| 3 Evidensmatrise | `buildEvidenceReviewSystemPrompt` | **Haiku** | ❌ | ❌ | JSON |
| 4 Scoring-utkast | `buildScoringSystemPrompt` | Sonnet | ❌ | ❌ | JSON |
| 5 Gap-søk | `buildGapResearchSystemPrompt` | Sonnet | ✅ | ❌ | JSON |
| Sluttrapport | `buildFinalReportSystemPrompt` | Opus | ✅ | ❌ | Markdown |

---

## 🔴 Forferdelig: Manifestet brukes aldri

`manifestFile` leses i `pipeline.ts`, men variabelen blir aldri videresendt til noen prompt.

Manifestet (`manifest-kondensert.md`) inneholder kjerneaksiomene bak prosjektet «Individets Suverenitet»: selveierskapet, NAP, intensjonsimmunitet, statens avledede legitimitet. Disse konseptene er **definerende for hele scoringsrammeverket**. Uten manifestet forstår agentene _hva_ ISI måler (dimensjoner og skala), men ikke _hvorfor_ (det filosofiske grunnlaget som avgjør grensetilfeller).

**Konsekvens:** Når en agent møter et ambivalent tilfelle — f.eks. en politiker som ønsker statlig folkehelse, men via tvang — mangler agenten det moralfilosofiske fundamentet som trengs for å vurdere riktig. ISI.md inneholder noe av det, men manifestet er skarpere og mer normativt.

**Hvem trenger det:** Minimum research-agenten (steg 1), scoring-agenten (steg 4) og sluttrapport-agenten (Opus). Ideelt alle.

---

## 🔴 Forferdelig: Haiku-prompten (steg 3, evidensmatrise) er kritisk undermåls

`buildEvidenceReviewSystemPrompt` er hele prompten Haiku får:

```
Du er en evidensredaktør for ISI.
Dedupliser, ranger og komprimer eksisterende research uten aa miste sporbarhet.
[scoreregler — 7 linjer]
Returner kun JSON.
```

### Problemer

1. **For kort.** Haiku er den svakeste modellen i pipelinen — den trenger _mer_ veiledning, ikke mindre. De ~12 linjene gir den nesten ingenting å jobbe med.

2. **Ingen ISI-rammeverk.** Haiku har ikke tilgang til ISI.md. Den vet hvilke score-verdier som er gyldige, men ikke hva dimensjonene betyr, hvordan de skal tolkes, eller hva som gjør et evidenspunkt relevant.

3. **Negativformulering.** «uten aa miste sporbarhet» forteller hva den _ikke_ skal gjøre. Haiku responderer bedre på positiv instruksjon: «Behold alle URL-er og kildehenvisninger fra de opprinnelige artefaktene.»

4. **Ingen output-skjema.** Den bes returnere JSON, men får aldri se eksempel eller skjema. Den eneste hinten er user-prompten: `Returner JSON med overallNarrative, crossDimensionNotes og en post per underdimensjon.` — en ustrukturert setning uten feltdefinisjoner, uten typer, uten eksempel.

5. **Ingen instrukser for narrativ vs. evidens.** Hva skal `narrative`-feltet inneholde? Syntese av claims? Oppsummering av stance? Begge? Lengde?

6. **Ingen instrukser for hva «dedupliser» betyr.** Skal den fjerne claims med identisk innhold? Identisk URL? Slå sammen claims fra ulike artefakter som sier det samme?

7. **Scorereglene er irrelevante.** Haiku scorer ingenting — den dedupliserer og rangerer evidence. Scorereglene bare bruker opp kontekst uten å hjelpe.

### User-prompten

```
Lag evidence matrix for ${actorName}.
Kildematerialet er en liste med underdimensjonsartefakter:
[hele JSON-dumpen av alle 24 artefakter]

Returner JSON med overallNarrative, crossDimensionNotes og en post per underdimensjon.
```

Hele artefaktlisten (24 stykker, potensielt ~50k tokens) dumpes ustrukturert inn. Haiku har ingen veiledning for hva den skal _gjøre_ med dette utover tre feltnavn.

---

## 🟠 Dårlig: Scoring-prompten (steg 4) mangler rammeverk og output-skjema

`buildScoringSystemPrompt`:

```
Du er en ISI-scorer.
Tildel observed underdimensjonsscorer.
Ikke regn ut totalscore; det gjøres i kode etterpå.
[scoreregler]
[imputation-instruksjoner, 3 linjer]
Returner kun JSON.
```

### Problemer

1. **Mangler ISI.md.** Scoring-agenten gjør den _viktigste_ vurderingen i hele pipelinen: den tilskriver (-2) til (+2) basert på evidence. Uten ISI-rammeverket vet den ikke hva som kvalifiserer til f.eks. (-2) vs. (-1). ISI.md har et eksplisitt eksempel (2.1 = -2, 6.1 = +2 for en politiker med intern inkonsistens) som ville hjulpet enormt.

2. **Mangler manifestet.** Intensjonsimmunitet, skillet mellom samarbeid og tvang — dette er nøyaktig det scoringsagenten trenger for å sette riktig fortegn.

3. **Imputation-instruksjoner bruker negativer.** «Bruk aldri sterkere imputering enn -1, 0 eller 1» og «Observed score skal forbli null» er negativformuleringer. Bør snus til: «Sett imputationCandidate til -1, 0 eller 1 — aldri -2 eller +2. La observed-feltet stå som null.»

4. **Uklart output-skjema.** User-prompten sier: `Returner JSON med subdimensions, keyStrengths, keyRisks og crossDimensionNotes. Hver subdimension kan inneholde: score, rationale, confidence, conflictingEvidence, imputationCandidate, imputationBasis, imputationRationale.` — men gir ingen eksempel-JSON, ingen typedefinisjon for hvert felt, ingen forklaring av hva `confidence` eller `conflictingEvidence` betyr.

5. **Mangler `subdimensionId` og `subdimensionName` i skjemabeskrivelsen.** Koden forventer begge i parsingen (linje 88-106 i `04_scoring-draft.ts`), men prompten nevner dem ikke. Modellen _må gjette_ at den skal inkludere dem.

---

## 🟠 Dårlig: Evidence harvest user-prompt har positivt bias i eksempel-JSON

`buildEvidenceHarvestUserPrompt` inneholder et JSON-skjema der alle eksempelverdier er:

```json
"stance": "positive",
"positionType": "explicit",
"confidence": "high",
"dataGap": false
```

Modellen ser kun positive/høy-confidence eksempler. For en subtil modell er dette en «default-bias» — den ser aldri et eksempel på `"stance": "negative"`, `"dataGap": true` eller `"confidence": "low"`. Spesielt for Sonnet med web search kan dette gjøre at den underrapporterer hull.

---

## 🟡 Forbedringspotensial: Research plan system-prompt

`buildResearchPlanSystemPrompt` er den beste prompten i pipelinen:

- Får ISI.md ✅
- Får scoreregler ✅
- Får dimensjonsliste ✅
- Tydelig rollebeskrivelse ✅

**Forbedringer:**

1. **Mangler manifest.** Bør inkludere manifestet (kondensert) slik at agenten forstår _verdensbildet_ som research-prioriteringer skal optimaliseres mot.

2. **Negativformulering:** «kutter svake søk» → «prioriter søk som leder til primærkilder».

3. **«Bruk web search aktivt» er tautologisk** — agenten har web_search-verktøyet og bruker det uansett. Mer nyttig: «Gjennomfør web-søk for hver underdimensjon. Prioriter offentlige registre (stortinget.no, regjeringen.no) og direkte sitater. Filtrer bort meningsblogger og kommentarfelt.»

---

## 🟡 Forbedringspotensial: Evidence harvest system-prompt

`buildEvidenceHarvestSystemPrompt`:

```
Du er en målrettet research-agent for ISI.
Oppgaven er å finne få, sterke evidenspunkter for en enkelt underdimensjon.
[scoreregler]
Ikke bruk plass på å gjenta URL-er i fritekst hvis de allerede finnes i sitatmetadata.
Returner kun JSON.
[framework]
```

**Bra:** Får ISI.md. Tydelig, fokusert rolle.

**Forbedringer:**

1. «Ikke bruk plass på å gjenta URL-er» — negativformulering. → «Referer til kilder via sitatmetadata. Brødteksten skal inneholde funn og analyse, ikke URL-er.»

2. Mangler instruksjon om at `dataGap: true` er et _ønsket_ output. Agenten bør vite at det er bedre å rapportere et gap enn å gjette. Legg til: «Sett dataGap til true når du etter grundig søk finner utilstrekkelig grunnlag. Et ærlig hull er bedre enn spekulativ evidens.»

3. Mangler manifest.

---

## 🟡 Forbedringspotensial: Gap research prompt

`buildGapResearchSystemPrompt`:

```
Du er en gap research-agent for ISI.
Dette er en oppfølgingsrunde som kun skal lukke konkrete kunnskapshull.
[scoreregler]
Returner kun JSON med samme skjema som evidence harvest.
[framework]
```

**Bra:** Får ISI.md. Rolle er tydelig.

**Forbedringer:**

1. «kun» er restriktivt uten å forklare hva den _faktisk skal gjøre_. → «Jobben din er å gjøre oppfølgingssøk for underdimensjoner som har lav confidence, manglende score, eller motstridende evidens fra første runde. Forsøk nye søkeinnfallsvinkler. Prioriter primærkilder. Rapporter ærlig om gapet fortsatt er åpent.»

2. Mangler manifest.

3. User-prompten gir kun «reasonLines» men ingen eksisterende evidens. Agenten vet ikke hva som allerede er funnet — den kan gjenta det samme søket som forrige runde.

---

## 🟡 Forbedringspotensial: Final report prompt

`buildFinalReportSystemPrompt` — den mest fullstendige prompten:

```
Du er en analytisk agent for tankesmien Individet.
Skriv den endelige rapporten utelukkende fra det kuraterte grunnlaget du faar.
[scoreregler]
[ObservedScore/EstimatedScore forklaring]
[instrukser om preutfylt mal]
[framework]
```

**Bra:** Får ISI.md. Tydelig om hva Opus skal gjøre. God presisjon om at scorer allerede er beregnet.

**Forbedringer:**

1. **Mangler manifest.** Opus skriver den _offentlige rapporten_. Manifestets normative stemme er nøyaktig det som bør gjennomsyre prosaen.

2. `'Skriv resten av rapporten ved aa fylle ut malen slavisk'` — skrivefeil (`aa` → `å`), og «slavisk» er tvetydig. Betyr det ordrett? Alle plassholdere? Betyr det at Opus aldri kan legge til kontekst? → «Fyll ut alle plassholderne i malen. Behold YAML-verdiene uendret. Skriv analytisk prosa i brødtekstfeltene. Følg malens strukturelle inndeling nøyaktig.»

3. User-prompten dytter inn `dossier`, `matrix` og `scoreDraft` som JSON-dump. For Opus er dette OK, men feltet `prefilledTemplate` inneholder allerede alle scorene i YAML. Dobbeltinfo kan forvirre: «Her er scorene» i YAML, og «her er de samme scorene» i JSON. Risiko for at Opus velger feil kilde ved avvik. Bør eksplisittere: «YAML-verdiene i malen er autoritative. JSON-grunnlaget er kontekst for prosaen.»

---

## 🟢 Bra: User-prompts med JSON-skjemaer (steg 1 og 2)

`buildResearchPlanUserPrompt` og `buildEvidenceHarvestUserPrompt` gir modellen komplett JSON-eksempel med riktige feltnavn. Parsing-koden i steg 1 og 2 matcher skjemaet. Dette er solid.

---

## 🟢 Bra: Scoreregel-teksten

`scoringRulesText()` er tydelig og korrekt:
- Riktig definisjon av null vs. 0
- Intensjonsimmunitet
- Eksplisitt > implisitt
- «Marker hull eksplisitt» — direkte, positivt formulert

Eneste minus: `'Ikke spekuler.'` — en negativ. → `'Rapporter kun posisjoner du kan dokumentere. Marker alt annet som null.'`

---

## Oppsummering: Prioritert handlingsliste

### Må fikses (påvirker rapportkvalitet direkte)

1. **Manifestet inn i prompts** — minimum steg 1, 4 og sluttrapport. Ideelt: alle.
2. **Haiku-prompten (steg 3) fullstendig omskriving** — output-skjema med JSON-eksempel, positivt formulerte instrukser, ISI.md inkludert, scorereglene erstattet med evidensbehandlingsregler.
3. **Scoring-prompten (steg 4) trenger ISI.md** og et komplett JSON-eksempel inkludert `subdimensionId`/`subdimensionName`.

### Bør fikses (forbedrer robusthet)

4. **Evidence harvest skjema-eksempel** — balanser med negative/null-eksempler.
5. **Gap research user-prompt** — gi agenten tilgang til forrige rundes funn.
6. **Final report «slavisk»-instruksjon** — presiser, fiks `aa`-skrivefeil.
7. **Snu alle negativformuleringer** til positive (8-10 steder totalt).

### Hygiene

8. `manifestFile` variabelen i `pipeline.ts` — enten bruk den eller fjern den.
9. `Aktor` i user-prompts → `Aktør` (mangler ø).
