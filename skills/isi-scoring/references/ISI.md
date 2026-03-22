# Individets Suverenitetsindeks (ISI)

### Et rammeverk for å vurdere om samfunnsaktører fremmer eller hemmer individets suverenitet

_Versjon 0.1 — Individets Suverenitet_

---

## Grunnlag og filosofisk forankring

ISI er forankret i selveierskapsprinsippet: ethvert menneske eier seg selv — sin kropp, sin tanke, sitt arbeid og fruktene av dette arbeidet. Denne innsikten, formulert av Locke, presisert av Bastiat, operasjonalisert av Rothbard og Spencer, bekreftet empirisk av Hayek og forsvart moralsk av Rand, utgjør indeksens normative kjerne.

**Ikke-aggresjonsprinsippet (NAP)** fungerer som den operative testen:

- En aktør scorer **positivt** ved å fremme frivillig samarbeid, forsvare individuelle rettigheter og begrense statlig tvang.
- En aktør scorer **negativt** ved å initiere, forsvare eller normalisere tvang mot individer — uavhengig av intensjon.

> _"Makten til å gjøre ting for mennesker er alltid makten til å gjøre ting med dem."_ — Isabel Paterson

**Hva ISI måler:** Enhver navngitt samfunnsaktør — politiker, parti, organisasjon, bevegelse, tankesmie, medieaktør — kan scores på bakgrunn av:

- Offentlige uttalelser og retorikk
- Stemmegivning og vedtatte politiske posisjoner
- Publiserte dokumenter, programmer og manifester
- Konkrete policy-forslag
- Partitilhørighet

---

## Del II: Filosofiske akser

| Tenker                                             | Kjernedimensjon                                                                                       | Primær trussel                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Aristoteles**                                    | Fornuften som individuell og udelelig — _logikon zôon_                                                | Tyranni som korrumperer den menneskelige blomstring (_eudaimonia_)                            |
| **Cicero / Stoikerne**                             | Universell naturlov — rettigheter gjelder alle, alltid                                                | Vilkårlig makt, positiv lov som overtrumfer naturloven                                        |
| **John Locke**                                     | Selveierskapet: kropp, arbeid, eiendom — statens legitimitet hviler på samtykke                       | Staten som bryter tilliten og konfiskerer det den er satt til å beskytte                      |
| **Frédéric Bastiat**                               | Liv, frihet, eiendom som pre-politiske fakta — loven finnes for å beskytte, ikke skape rettigheter    | Lovlig plyndring (_la spoliation légale_): flertallet bruker staten til å ta fra mindretallet |
| **Herbert Spencer**                                | Likhetsloven: enhver har frihet til å gjøre hva han vil, så lenge han ikke krenker andres like frihet | Tvangsmessig veldedighet og kollektivistisk lovgivning                                        |
| **Lysander Spooner**                               | Naturlige rettigheter er gyldige uavhengig av positiv lov og statlig godkjenning                      | Grunnloven som sosial kontrakt man aldri har samtykket til                                    |
| **Murray Rothbard**                                | Selveierskapsaksiomet som fundament for all politisk filosofi; NAP som operativ regel                 | Staten som institusjonalisert aggresjon — skatt som tvungen overføring                        |
| **Ayn Rand**                                       | Individuelle rettigheter som etisk-politisk fundament; produktivt arbeid som menneskelig dyd          | Altruisme som moralsk fundament for kollektivisme og statstvang                               |
| **Friedrich Hayek**                                | Spontan orden og dispersert kunnskap; rettsstaten som upersonlige regler, ikke politisk vilje         | Konstruktivistisk rasjonalisme, sentralplanlegging, "veien til trelldom"                      |
| **John Stuart Mill**                               | Skadeprinsippet: tvang er kun legitim for å forhindre skade på andre                                  | Paternalisme, sosial konformitet, tyranni av opinion                                          |
| **Isaiah Berlin**                                  | Negativ frihet (fravær av hindringer) vs. positiv frihet (mulighet til å realisere seg selv)          | Positiv frihet brukt til å rettferdiggjøre statlig inngrep                                    |
| **Robert Nozick**                                  | Begrensningsprinsipper (_side constraints_): individets rettigheter er grenser, ikke mål              | Omfordelingsstaten som krenker eiendomsrettigheter uavhengig av resultat                      |
| **Rose Wilder Lane / Isabel Paterson / A.J. Nock** | Frihet som en måte å bevege seg på, ikke et endepunkt; staten som monopol på tvang                    | Gode intensjoner som rettferdiggjøring for ekspanderende statsmakt                            |

**Tverrsnitt av filosofisk konsensus — hva ISI ALLTID må inkludere:**

1. **Selveierskapet** — kontroll over egen kropp, sinn og arbeid
2. **Eiendomsretten** — vern om fruktene av eget arbeid
3. **NAP-overholdelse** — forbud mot å initiere tvang
4. **Rettsstaten** — upersonlige, forutsigbare regler som gjelder likt for alle
5. **Ytringsfrihet** — tanken og ytringen som utenfor statens domene
6. **Voluntarisme** — frivillig samarbeid som normativ standard for sosial organisering

---

## Del III: ISI — Dimensjoner og skåringskriterier

### Skala

Hver underdimensjon scores på en **skala fra −2 til +2**:

| Score  | Betydning                                                                        |
| ------ | -------------------------------------------------------------------------------- |
| **+2** | Aktøren fremmer aktivt og konsekvent denne friheten                              |
| **+1** | Aktøren støtter denne friheten, men med viktige forbehold eller inkonsekvent     |
| **0**  | Nøytral, uklar posisjon eller ingen dokumentert standpunkt                       |
| **−1** | Aktøren støtter tiltak som begrenser denne friheten, men ikke som eksplisitt mål |
| **−2** | Aktøren fremmer aktivt politikk eller retorikk som krenker denne friheten        |

**Totalskår:** Summer av alle underdimensjoner.

---

### Klassifisering (0-100)

`isiClass` settes automatisk ut fra totalskåren på 0-100-skalaen:

| ISI-skår | Klasse                           |
| -------- | -------------------------------- |
| 80-100   | **Sterkt suverenitetsfremmende** |
| 60-79    | **Suverenitetsfremmende**        |
| 40-59    | **Blandet profil**               |
| 20-39    | **Suverenitetshemmende**         |
| 0-19     | **Sterkt suverenitetshemmende**  |

Bruk disse fem klassene konsekvent. Ikke innfør egne etiketter som "selektiv", "moderat" eller "ambivalent" i `isiClass`; slike nyanser beskrives i analysedelen.

---

### Om `templateVersion`

`templateVersion` er den eneste versjonsmarkøren i rapportmalen. Den beskriver hvilken versjon av ISI-malen rapporten følger, inkludert frontmatter-felt, seksjonsstruktur og andre krav til outputformat.

Øk `templateVersion` når malen endres, for eksempel når et felt legges til eller fjernes, når frontmatter endres, eller når rapportstrukturen justeres på en måte som nye rapporter må følge.

---

### Dimensjon 1: Kroppslig autonomi og selvbestemmelse (D1)

_Forankring: Locke (selveierskapet), Rothbard (selveierskapsaksiomet), Mill (skadeprinsippet)_

| #   | Underdimensjon                   | Kjernetest                                                                                                                                                                    |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Medisinsk selvbestemmelse        | Støtter aktøren individets rett til egne medisinske beslutninger uten statlig tvang? Har aktøren støttet obligatoriske medisinske tiltak?                                     |
| 1.2 | Livsstilsautonomi                | Fremmer aktøren individets rett til å velge livsstil (kosthold, rusmidler til eget bruk, seksualitet, religiøs praksis) uten statlig innblanding der ingen tredjepart skades? |
| 1.3 | Bevegelsesfrihet                 | Støtter aktøren fri bevegelse — inkl. retten til å forlate et land, bosette seg og arbeide uten unødige statlige restriksjoner?                                               |
| 1.4 | Selvbestemmelse ved livets slutt | Anerkjenner aktøren individets rett til å bestemme over eget livs avslutning?                                                                                                 |

---

### Dimensjon 2: Ytringsfrihet og intellektuell autonomi (D2)

_Forankring: Mill (On Liberty), Hayek (spontan orden i ideer), Spooner (naturlig rett til ytring)_

| #   | Underdimensjon                            | Kjernetest                                                                                                                                              |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Ytringsfrihet — innhold                   | Har aktøren støttet lover eller regulering som begrenser lovlig ytring basert på innhold (hatytringslover, blasfemilover, "desinformasjon"-lovgivning)? |
| 2.2 | Pressefrihet og redaksjonell uavhengighet | Støtter aktøren statlig finansiering eller regulering av medier som skaper avhengighet? Har aktøren fremmet inngrep i redaksjonelle beslutninger?       |
| 2.3 | Akademisk og vitenskapelig frihet         | Har aktøren støttet posisjoner som underlegger akademisk forskning politisk kontroll?                                                                   |
| 2.4 | Ytringsfrihet på digitale plattformer     | Støtter aktøren statlig regulering av private plattformers innholdsmoderering? Har aktøren oppfordret til avplattforming av lovlige ytringer?           |

---

### Dimensjon 3: Eiendomsrett og økonomisk frihet (D3)

_Forankring: Locke (arbeidsteori for eiendom), Bastiat (eiendom som pre-politisk), Nozick (berettigelsesteorien)_

| #   | Underdimensjon               | Kjernetest                                                                                                              |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Eiendomsvern                 | Støtter aktøren statlig ekspropriasjon eller regulering som effektivt konfiskerer eiendomsverdi uten full kompensasjon? |
| 3.2 | Skatt og tvungen omfordeling | Ser aktøren skatt primært som et nødvendig onde med strenge grenser, eller som et instrument for omfordeling?           |
| 3.3 | Næringsfrihet og regulering  | Støtter aktøren tiltak som gjør det vanskeligere å starte, drive eller avslutte en virksomhet?                          |
| 3.4 | Arbeidsmarkedsfrihet         | Støtter aktøren statlige inngrep i kontraktsfriheten mellom arbeidsgiver og arbeidstaker?                               |
| 3.5 | Handelsfrihet                | Støtter aktøren proteksjonisme, toll og eksportkontroll som primær næringspolitikk?                                     |
| 3.6 | Monetær frihet               | Støtter aktøren prisregulering, statlig monopol på penger eller CBDC med overvåkings- og kontrollformål?                |

---

### Dimensjon 4: Rettsstat og likebehandling (D4)

_Forankring: Cicero (lex naturalis), Hayek (upersonlige regler), Bastiat (loven som vern, ikke plyndring)_

| #   | Underdimensjon                       | Kjernetest                                                                                                                                                      |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Lik anvendelse av loven              | Støtter aktøren særbehandling (positiv diskriminering, kvotering, identitetsbaserte unntak) som bryter med likebehandlingsprinsippet?                           |
| 4.2 | Rettslig uavhengighet                | Har aktøren forsøkt å påvirke domstolsavgjørelser eller politisere juridiske prosesser?                                                                         |
| 4.3 | Rettssikkerhet og uskyldspresumpsjon | Støtter aktøren administrative sanksjoner eller andre tiltak som omgår rettsprosessen og reverserer bevisbyrden?                                                |
| 4.4 | Begrenset statsmakt                  | Støtter aktøren konstitusjonelle begrensninger på statsmakten — eller søker aktøren fullmaktslover, nødrettsbestemmelser og delegering av lovgivningsmyndighet? |

---

### Dimensjon 5: Forenings-, forsamlings- og religionsfrihet (D5)

_Forankring: Hayek (spontan orden i sivilsamfunnet), Lane/Paterson (sivilsamfunn som alternativ til staten)_

| #   | Underdimensjon                        | Kjernetest                                                                                                                |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Religionsfrihet                       | Støtter aktøren statlig regulering av religiøs praksis, tvungen sekularisme eller privilegering av én religiøs tradisjon? |
| 5.2 | Politisk foreningsfrihet              | Støtter aktøren forbud mot eller regulering av politiske partier eller bevegelser basert på ideologisk innhold?           |
| 5.3 | Sivilsamfunn vs. statlig substitusjon | Fremmer aktøren statlige løsninger der frivillig sivilsamfunn historisk har fylt behovet?                                 |
| 5.4 | Forsamlingsfrihet                     | Har aktøren støttet tiltak som begrenser retten til å møtes, demonstrere eller samles?                                    |

---

### Dimensjon 6: Digital autonomi og informasjonsfrihet (D6)

_Forankring: Selveierskapet utvidet til digitalt liv (Locke), Hayek (informasjonsfrihet som forutsetning for spontan orden)_

| #   | Underdimensjon                | Kjernetest                                                                                                                                     |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Overvåkning og personvern     | Har aktøren støttet masseovervåkning, datalagringspåbud eller statens tilgang til privat kommunikasjon uten domstolskjennelse?                 |
| 6.2 | Digital identitet og kontroll | Støtter aktøren obligatoriske digitale ID-systemer, CBDC med programmerbar bruk, eller sosiale kredittmekanismer?                              |
| 6.3 | Internettfrihet og kryptering | Har aktøren støttet tiltak som begrenser kryptering, bakdører i kommunikasjonssystemer, eller statlig kontroll over internettinfrastruktur?    |
| 6.4 | Eierskap til egne data        | Støtter aktøren individets rett til å eie og kontrollere egne data — eller fremmer aktøren statlig/korporativ datahøsting uten reelt samtykke? |

---

### Vektingsmodell (v0.1)

Alle dimensjoner vektes likt. Begrunnelse: NAP impliserer at alle former for tvang er likeverdige krenker av individets suverenitet.

| Dimensjon                            | Underdimensjoner | Maks poeng |
| ------------------------------------ | ---------------- | ---------- |
| D1. Kroppslig autonomi               | 4                | ±8         |
| D2. Ytringsfrihet                    | 4                | ±8         |
| D3. Eiendomsrett og økonomisk frihet | 6                | ±12        |
| D4. Rettsstat og likebehandling      | 4                | ±8         |
| D5. Forenings- og religionsfrihet    | 4                | ±8         |
| D6. Digital autonomi                 | 4                | ±8         |
| **Totalt**                           | **26**           | **±52**    |

---

## Del IV: Skåringsveiledning

**Dokumentasjonskrav per underdimensjon:**

1. Identifiser primærkilder (stemmegivning, partiprogram, uttalelse, kronikk)
2. Vurder konsistens over tid (ett enkelttilfelle vs. mønster)
3. Skill mellom _eksplisitt posisjon_ (høyere vekt) og _implisitt posisjon_ (lavere vekt)
4. Noter selvmotsigelser — inkonsistente aktører scores på det overveiende mønsteret

**Eksempel — Politiker som støtter hatytringslover men motarbeider digital overvåkning:**

- 2.1 Ytringsfrihet innhold: −2
- 6.1 Overvåkning: +2
- Kommentar: Intern inkonsistens noteres; aktøren viser selektiv frihetsorientering

---

## Del V: Filosofisk metanote

ISI er ikke politisk nøytral. Den er fundert i en konsistent etisk posisjon: at tvang alltid er et onde som krever begrunnelse, og at frivillig samhandling alltid er normativt overlegent statlig påbud.

- **ISI skiller mellom frihet og resultat.** En aktør som ønsker god helse for befolkningen, men oppnår det gjennom tvang, scores negativt.
- **ISI er immun mot intensjonsargumentet.** Gode intensjoner endrer ikke den moralske karakteren av tvang.
- **ISI er asymmetrisk.** De fleste politiske aktører i moderne stater opererer innenfor et paradigme som forutsetter statlig intervensjon som standard. En konsekvent suverenitetsforkjemper er unntaket, ikke regelen.

---

_ISI v0.1 — Individet / Individets Suverenitet_
