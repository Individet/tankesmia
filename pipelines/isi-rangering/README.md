Denne pipelinen går gjennom følgende faser:

## 00 Lager en aktørprofil per angitt aktør

Generelle haiku-søk lager en profil per aktør. Denne blir lagret som en markdown-fil, og comittet til repoet med rådata:

git@github.com:Individet/r-data.git

i plasseringen isi-rangering/[actor-slug]/profil.md

## 01 Lager en søkerapport per dimensjon

Denne aktør-profilen blir også tatt med videre, hvor hver angitt aktør blir analysert i ISI-rangeringens seks dimensjoner, av haiku søke-agenter.

Disse rapportene blir også lagret som hver sin markdown-fil, i samme repo som den nevnt over:

git@github.com:Individet/r-data.git

i plasseringene

- isi-rangering/[actor-slug]/d1-search.md
- isi-rangering/[actor-slug]/d2-search.md
- isi-rangering/[actor-slug]/d3-search.md
- isi-rangering/[actor-slug]/d4-search.md
- isi-rangering/[actor-slug]/d5-search.md
- isi-rangering/[actor-slug]/d6-search.md

## 02 Lager en fullstendig rapport

Til slutt blir en fullstendig rapport lagd om hver aktør, basert på de syv foregående markdown-filene. Denne blir skrevet av Opus, og følger malen man finner i `skills\isi-scoring\references\template.md`. Deretter blir resultatet sendt som en PR mot hjemmesiden på repoet https://github.com/Individet/individet.github.io med plassering `content/isi/reports/[actor-slug].md`
