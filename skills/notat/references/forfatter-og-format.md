# Forfatter, format og konvensjoner for Individet-notater

## Hva er et Individet-notat?

Et Individet-notat er en evidensbasert analyse av et avgrenset politisk eller
samfunnsmessig spørsmål, skrevet fra perspektivet til individuell suverenitet.
Det er lengre og grundigere enn en kronikk, kortere og skarpere enn en
akademisk rapport. Formålet er tredelt:

1. **Dokumentere** — samle og strukturere fakta som belyser et problem
2. **Analysere** — tolke faktaene gjennom Individets filosofiske rammeverk
3. **Anbefale** — foreslå konkrete tiltak som styrker individuell suverenitet

Notatet er ikke en nøytral utredning. Det er en argumenterende analyse med
transparent normativt utgangspunkt. Leseren skal alltid vite hvor Individet
står — og *hvorfor*.

---

## Notatets oppbygning

Hvert notat er et selvstendig dokument. Det finnes ingen rigid mal. Men
vellykkede notater har en gjenkjennelig dramaturgi som kan beskrives i fem
faser:

### 1. Inngang

De første avsnittene bestemmer om notatet blir lest. Inngangens jobb er å
etablere *hvorfor dette spørsmålet er pressende nå* og *hva som står på spill
for individet*.

Gode innganger: Et konkret eksempel, en overraskende statistikk, en hendelse
som illustrerer problemet, et paradoks. Dårlige innganger: «I dette notatet
skal vi se på...», «Det har lenge vært debattert...».

### 2. Bakgrunn og status quo

Kortfattet faktisk redegjørelse for dagens situasjon. Hva er gjeldende lov,
praksis eller ordning? Hvordan fungerer den? Hvem berøres? Hva er
størrelsesordenen (kroner, mennesker, tidshorisont)?

Denne seksjonen er deskriptiv. Kildehenvisninger er obligatoriske for ethvert
faktuelt utsagn. Brukeren må kunne verifisere alt.

### 3. Analyse

Her gjøres det normative arbeidet. Analysen anvender Individets filosofiske
rammeverk — selveierskapsprinsippet, frivillig samarbeid som
legitimitetskriterium, rettigheter utledet av menneskets natur — på den
faktiske situasjonen.

Nøkkelen er å være eksplisitt om *hvilket prinsipp* som gjør at den gjeldende
ordningen er problematisk. Ikke bare «dette er dyrt» eller «dette fungerer
dårlig» — men *dette krenker individets rett til X fordi Y*.

**Motargumenter.** Et troverdig notat adresserer det sterkeste argumentet for
status quo. Ikke et stråmannsargument, men det argumentet en kompetent
forsvarer av dagens ordning faktisk ville fremført. Møt det direkte — med
empiri, med prinsipiell analyse, eller ved å vise at det forutsetter premisser
Individet avviser (og si eksplisitt hvilke).

**Komparativ evidens.** Når det finnes relevante internasjonale erfaringer —
land som har gjort det annerledes, reformer som er gjennomført, naturlige
eksperimenter — er dette gull. Bruk det. Frihet-velstand-korrelasjoner fra
Heritage Index, Human Freedom Index eller Individets eget
frihet-og-velstand-portal er verdifulle referansepunkter.

### 4. Anbefalinger

Konkrete, implementerbare tiltak. Ikke vage appeller om «mer frihet» — men
spesifikke endringer i lov, forskrift, praksis eller institusjon.

For hvert tiltak: Hva foreslås? Hva er den forventede virkningen? Hva er
alternativkostnaden? Hvem kan gjennomføre det?

Det er legitimt å foreslå tiltak som er politisk urealistiske på kort sikt,
forutsatt at du er ærlig om det. Noen ganger er notatets viktigste funksjon å
flytte grensene for hva som anses diskutabelt.

### 5. Avslutning

Kort. Ikke oppsummering — leseren har nettopp lest analysen. Avslutningen
trekker den store linjen: hva betyr dette for individets suverenitet, og
hvorfor bør det norske samfunnet bry seg?

---

## Frontmatter

Hvert notat leveres som en markdown-fil med følgende YAML frontmatter:

```yaml
---
title: "{Notatets tittel}"
subtitle: "{Valgfri undertittel som presiserer omfang eller tilnærming}"
date: YYYY-MM-DD
slug: {slug}
type: notat
description: "{Én setning — notatets kjernefunn eller argument. Brukes som ingress}"
tags: [{tag1}, {tag2}, {tag3}]
author: "{Modellnavn brukt til å skrive notatet, f.eks. 'Claude Opus 4.6'}"
sources:
  - title: "{Kildetittel}"
    url: "{URL}"
---
```

`sources` i frontmatter er en komplett liste over alle kilder brukt i
fotnotene. Fotnotene i brødteksten refererer til kildene inline — frontmatter
samler dem maskinlesbart.

`type: notat` skiller notater fra reportasjer og ISI-analyser i
publiseringspipeline.

Slug-konvensjon: små bokstaver, æ→ae/ø→oe/å→aa, mellomrom→bindestrek,
maks 50 tegn.

---

## Figurer

Notater kan inneholde figurer — grafer, diagrammer eller tabeller som belyser
analysen. Figurer er valgfrie. Bruk dem kun når en visualisering faktisk
kommuniserer noe teksten ikke kan.

### Markdown-annotasjon

Figurer refereres i markdown med `¬`-prefiks (i stedet for `!` for bilder):

```markdown
¬[Figur 1: Leseferdigheter blant 15-åringer, PISA 2003–2022](figur_01 "Leseferdigheter blant 15-åringer")
```

Alt-teksten er figurens fulle bildetekst. Tittelen i anførselstegn brukes
som kort tittel i selve visualiseringen. ID-en (`figur_01`) kobler til
JSON-filen.

### JSON-fil

Figurdataene leveres i en separat fil: `{slug}.figurer.json`. Formatet
følger **tidy data**-konvensjonen — en array av objekter der hvert objekt
er én observasjon — som er de facto-standarden for Observable Plot og D3.

```json
{
  "figur_01": {
    "mark": "line",
    "title": "Leseferdigheter blant 15-åringer",
    "source": "PISA, OECD",
    "x": "year",
    "y": "score",
    "stroke": "country",
    "data": [
      { "year": 2003, "score": 500, "country": "Norge" },
      { "year": 2006, "score": 484, "country": "Norge" },
      { "year": 2009, "score": 503, "country": "Norge" },
      { "year": 2022, "score": 477, "country": "Norge" },
      { "year": 2003, "score": 543, "country": "Finland" },
      { "year": 2006, "score": 547, "country": "Finland" },
      { "year": 2009, "score": 536, "country": "Finland" },
      { "year": 2022, "score": 490, "country": "Finland" }
    ],
    "annotations": [
      { "x": 2006, "label": "Kunnskapsløftet" }
    ]
  }
}
```

### Feltbeskrivelse

| Felt | Påkrevd | Beskrivelse |
|---|---|---|
| `mark` | ja | Observable Plot mark-type: `line`, `bar`, `barX`, `dot`, `area`, `cell`, `text` |
| `title` | ja | Kort tittel vist over figuren |
| `source` | ja | Datakilde — vises under figuren |
| `x` | ja | Feltnavn i `data` som mappes til x-aksen |
| `y` | ja | Feltnavn i `data` som mappes til y-aksen |
| `stroke` | nei | Feltnavn for linjefargeserie (flerseriegrafer) |
| `fill` | nei | Feltnavn for fyllfargeserie (stolpediagram, areal) |
| `data` | ja | Tidy data — array av objekter, én rad per observasjon |
| `annotations` | nei | Array av `{ x, y?, label }` — referanselinjer eller hendelsesmarkører |
| `xLabel` | nei | Egendefinert aksetikett (standard: verdien i `x`) |
| `yLabel` | nei | Egendefinert aksetikett (standard: verdien i `y`) |

### Regler for data

- **All data må være reell.** Figurer i et Individet-notat er basert på
  faktiske datasett fra forskningen. Oppgi alltid `source`. Ingen
  illustrative eller fiktive data.
- **Tidy format.** Hver rad er én observasjon. Flere serier (land, grupper)
  håndteres med en serie-kolonne (`stroke`/`fill`), ikke med separate
  arrays.
- **Hold det lite.** Inkluder bare datapunktene som trengs for figuren.
  Ikke dump hele datasettet — kuratér for lesbarhet.
- **Norske etiketter.** Titler, aksenavn og annotasjoner på norsk.

### Typiske figurtyper for Individet-notater

| Behov | Mark | Eksempel |
|---|---|---|
| Utvikling over tid | `line` | PISA-resultater, skattetrykk, BNP-vekst |
| Sammenligning mellom land/grupper | `bar` | Økonomisk frihet, skattenivå, sysselsetting |
| Korrelasjon mellom to variabler | `dot` | Frihet vs. velstand (fra portalen) |
| Fordeling | `area` | Inntektsfordeling, skattebyrde etter desil |
| Rangering | `barX` | ISI-poengsum for aktører, landrangering |

---

## Formelle elementer

### Tittel

Tittelen skal kommunisere notatets *argument*, ikke bare dets *tema*. En god
tittel har en påstand eller et funn.

- **Svakt:** «Sykelønnsordningen i Norge»
- **Sterkt:** «Sykelønn uten egenbetaling: Hvorfor full kompensasjon
  undergraver selvbestemmelse»

En undertittel kan brukes for å presisere omfang eller tilnærming.

### Lengde

2 000–6 000 ord. Kortere enn 2 000 er en kronikk, ikke et notat. Lengre enn
6 000 krever svært godt kildemateriale og et genuint komplekst tema.

### Kildehenvisninger

Fotnoter (`[^1]`) for alle faktuelt verifiserbare utsagn. Minst 10 kilder for
et fullverdig notat — dette er et empirisk arbeid, ikke et essay.

Kildeprioritet:
1. Primærkilder: lovtekster, stortingsdokumenter, offisielle statistikker,
   regjeringsdokumenter, partiprogram
2. Akademisk forskning: fagfellevurdert der det finnes
3. Anerkjente indekser: Heritage, Fraser, Freedom House, WJP, RSF
4. Kvalitetsmedia: Stortingets referat > NTB > riksmedia > kommentariater
5. Tankesmie-publikasjoner: Civita, Agenda, Langsikt, internasjonale
   tankesmier — alltid med merknad om normativt ståsted

### Språk og terminologi

Norsk bokmål. Presist, klart, uten akademisk jargong.

- «Frivillig samarbeid vs. initiering av makt» — Individets
  kjerneformulering, foretrukket over «NAP» (som er et rothbardiansk
  begrep ukjent for folk flest)
- Rettigheter er utledet av menneskets natur som rasjonelt vesen — ikke
  «naturlige rettigheter» i lockeansk forstand alene, men i Rands
  formulering: rettigheter som eksistensbetingelser
- Navngi institusjonene (eiendomsrett, kapitalisme, frihandel) først *etter*
  at leseren er overbevist gjennom analysen

---

## Integrasjon med Individets økosystem

Et notat eksisterer ikke i et vakuum. Det bygger på og refererer til:

- **Manifestet** *Individets Suverenitet* — for filosofisk forankring.
  Referer til det eksplisitt når du bruker begreper som selveierskap,
  frivillig samarbeid, suverenitetshierarkiet
- **ISI-analyser** — når notatet omhandler aktører som er ISI-scoret, bruk
  scoren som referansepunkt
- **Frihet-og-velstand-portalen** — når notatet bruker komparativ evidens
  mellom land, referer til portalen (individet.no/frihet-og-velstand/)
- **Reportasjer** — tidligere Individet-artikler som belyser temaet fra
  historisk eller narrativ vinkel


Kryssreferanser styrker hvert enkelt produkt og bygger Individet som
kunnskapsbase.

---

## Tone og holdning

Individet-notater er **saklige, kildebaserte og normativt tydelige**.

Det betyr:
- Si hva analysen viser. Ikke gjemme deg bak «det kan argumenteres for at...»
- Bruk presise tall, ikke vage formuleringer som «mange» eller «betydelig»
- Anerkjenn usikkerhet eksplisitt fremfor å overdrive sikkerhet
- Behandle meningsmotstandere med respekt — argumentene deres, ikke
  personene, er målet
- Aldri fordreie fakta. Hvis et faktum svekker din posisjon, rapporter det
  og forklar hvorfor konklusjonen likevel holder
- Skriv som en person som eier sin analyse og tar ansvar for den — ikke som
  en institusjon som hedger

Det som skiller Individets notater fra Civitas: Civita er bredt liberal og
opererer innenfor mainstream borgerlig politikk. Individet er forankret i
selveierskapsprinsippet og er villig til å trekke konklusjoner Civita ikke vil
— om skatt som tvungen overføring, om velferdsstatens legitimitetsproblem, om
verneplikt som krenkelse av kroppslig autonomi. Individet er ikke mer
*radikalt* — det er mer *konsekvent*.
