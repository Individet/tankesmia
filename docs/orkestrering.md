# Manuell Orkestrering

Denne arbeidsflyten brukes frem til mer automatisering er på plass.

## Flyt

Jeg har installert skillen [isi-scoring](../skills/isi-scoring/SKILL.md) i Claude.ai, og benytter meg utelukkende av Research-funksjonen med Claude Opus 4.6 (eller høyere).

1. Jeg skriver "Lag en ISI-verdi for [navn på person eller organisasjon]".
2. Claude.ai initierer en forskningsprosess, 6 parallelle prosesser (en for hver dimensjon) samler inn hundrevis av kilder.
3. Alle kildene blir sammenflettet til en utførlig rapport om aktøren.
4. Jeg skriver "Skriv en ISI-rapport etter malen".
5. En ny mer teknisk rapport blir generert, som beregner indikatorverdier for alle underdimensjoner.

På denne måten blir to rapporter skrevet: En grunnlagsrapport, som oppsummerer all forskningen som er gjort innenfor de seks dimensjoner samt underdimensjoner. En teknisk analyse, som beregner indikatorverdier for alle underdimensjoner.

## Kvalitetssikring

Håndplukkede rapporter blir analysert, og referanser fulgt. Det er allikevel ikke slik at
jeg foretar noen redigeringer av rapporten. Ved feil eller mangler oppdaterer jeg
SKILL-filen til Claude.ai, og forsøker å få til at AI-agenten ikke gjør samme feil på nytt.

Feil eller mangler i hver rapport kan og vil selvfølgelig forekomme. På samme måte som om
forskningen hadde vært utført, og rapporten skrevet av, mennesker, så kan også AI-agenter
overse ting, feiltolke uttalelser, ikke forstå kontekster og sammenhenger, og så videre.
Jeg er allikevel overbevist om at kvaliteten på slutt-resultatet: En ISI-verdi mellom 0 og
100, er pålitelig og troverdig.
