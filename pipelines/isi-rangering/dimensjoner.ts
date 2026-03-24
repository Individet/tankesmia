export const DIMENSJONER = [
  {
    id: 'D1',
    navn: 'Kroppslig autonomi og selvbestemmelse',
    forankring:
      'Locke (selveierskapet), Rothbard (selveierskapsaksiomet), Mill (skadeprinsippet)',
    underdimensjoner: [
      '1.1 Medisinsk selvbestemmelse',
      '1.2 Livsstilsautonomi',
      '1.3 Bevegelsesfrihet',
      '1.4 Selvbestemmelse ved livets slutt',
    ],
    beskrivelser: [
      'Støtter aktøren individets rett til egne medisinske beslutninger uten statlig tvang? Har aktøren støttet obligatoriske medisinske tiltak?',
      'Fremmer aktøren individets rett til å velge livsstil (familieliv, kosthold, rusmidler til eget bruk, seksualitet, religiøs praksis) uten statlig innblanding der ingen tredjepart skades?',
      'Støtter aktøren fri bevegelse — inkl. retten til å forlate et land, bosette seg og arbeide uten unødige statlige restriksjoner?',
      'Anerkjenner aktøren individets rett til å bestemme over eget livs avslutning?',
    ],
    søkestrategi: `
      Søk etter: vaksineplikt, koronarestriksjoner, rusmiddelpolitikk, eutanasi/assistert død,
      bevegelsesrestriksjoner, pasientrettigheter, medisinsk frihet. Prioriter primærkilder.
    `,
  },
  {
    id: 'D2',
    navn: 'Ytringsfrihet og intellektuell autonomi',
    forankring:
      'Mill (On Liberty), Hayek (spontan orden i ideer), Spooner (naturlig rett til ytring)',
    underdimensjoner: [
      '2.1 Ytringsfrihet — innhold',
      '2.2 Pressefrihet og redaksjonell uavhengighet',
      '2.3 Akademisk og vitenskapelig frihet',
      '2.4 Ytringsfrihet på digitale plattformer',
    ],
    beskrivelser: [
      'Har aktøren støttet lover eller regulering som begrenser lovlig ytring basert på innhold (hatytringslover, blasfemilover, "desinformasjon"-lovgivning)?',
      'Støtter aktøren statlig finansiering eller regulering av medier som skaper avhengighet? Har aktøren fremmet inngrep i redaksjonelle beslutninger?',
      'Har aktøren støttet posisjoner som underlegger akademisk forskning politisk kontroll?',
      'Støtter aktøren statlig regulering av private plattformers innholdsmoderering? Har aktøren oppfordret til avplattforming av lovlige ytringer?',
    ],
    søkestrategi: `
      Søk etter: hatytringslover, ytringsfrihetskommisjonen, pressefrihet, PFU, mediestøtte,
      akademisk ytringsfrihet, plattformregulering, NRK-debatt, blasfemiloven,
      meningspoliti. Prioriter primærkilder.
    `,
  },
  {
    id: 'D3',
    navn: 'Eiendomsrett og økonomisk frihet',
    forankring:
      'Locke (arbeidsteori for eiendom), Bastiat (eiendom som pre-politisk), Nozick (berettigelsesteorien)',
    underdimensjoner: [
      '3.1 Eiendomsvern, skatt og ekspropriering',
      '3.2 Næringsfrihet og regulering',
      '3.3 Handelsfrihet',
      '3.4 Monetær frihet',
    ],
    beskrivelser: [
      'Støtter aktøren statlig ekspropriasjon eller regulering som effektivt konfiskerer eiendomsverdi uten full kompensasjon? Ser aktøren skatt primært som et nødvendig onde med strenge grenser, eller som et instrument for omfordeling?',
      'Støtter aktøren tiltak som gjør det vanskeligere å starte, drive eller avslutte en virksomhet? Støtter aktøren statlige inngrep i kontraktsfriheten mellom arbeidsgiver og arbeidstaker?',
      'Støtter aktøren proteksjonisme, toll og eksportkontroll som primær næringspolitikk?',
      'Støtter aktøren prisregulering, statlig monopol på penger eller CBDC med overvåkings- og kontrollformål?',
    ],
    søkestrategi: `
      Søk etter: skattepolitikk, formuesskatt, ekspropriasjon, eiendomsregulering,
      næringsfrihet, arbeidsmiljøloven, tariffavtaler, handelspolitikk, CBDC,
      prisregulering, statlige monopoler. Prioriter primærkilder.
    `,
  },
  {
    id: 'D4',
    navn: 'Rettsstat og likebehandling',
    forankring:
      'Cicero (lex naturalis), Hayek (upersonlige regler), Bastiat (loven som vern, ikke plyndring)',
    underdimensjoner: [
      '4.1 Lik anvendelse av loven',
      '4.2 Rettslig uavhengighet',
      '4.3 Rettssikkerhet og uskyldspresumpsjon',
      '4.4 Begrenset statsmakt',
    ],
    beskrivelser: [
      'Støtter aktøren særbehandling (positiv diskriminering, kvotering, identitetsbaserte unntak) som bryter med likebehandlingsprinsippet?',
      'Har aktøren forsøkt å påvirke domstolsavgjørelser eller politisere juridiske prosesser?',
      'Støtter aktøren administrative sanksjoner eller andre tiltak som omgår rettsprosessen og reverserer bevisbyrden?',
      'Støtter aktøren konstitusjonelle begrensninger på statsmakten — eller søker aktøren fullmaktslover, nødrettsbestemmelser og delegering av lovgivningsmyndighet?',
    ],
    søkestrategi: `
      Søk etter: kvotering, positiv diskriminering, fullmaktslover, nødrettsbestemmelser,
      domstolenes uavhengighet, administrative sanksjoner, rettsstatsprinsipper,
      bevisbyrde, likebehandling. Prioriter primærkilder.
    `,
  },
  {
    id: 'D5',
    navn: 'Forenings-, forsamlings- og religionsfrihet',
    forankring:
      'Hayek (spontan orden i sivilsamfunnet), Lane/Paterson (sivilsamfunn som alternativ til staten)',
    underdimensjoner: [
      '5.1 Religionsfrihet',
      '5.2 Politisk foreningsfrihet',
      '5.3 Sivilsamfunn vs. statlig substitusjon',
      '5.4 Forsamlingsfrihet',
    ],
    beskrivelser: [
      'Støtter aktøren statlig regulering av religiøs praksis, tvungen sekularisme eller privilegering av én religiøs tradisjon?',
      'Støtter aktøren forbud mot eller regulering av politiske partier eller bevegelser basert på ideologisk innhold?',
      'Fremmer aktøren statlige løsninger der frivillig sivilsamfunn historisk har fylt behovet?',
      'Har aktøren støttet tiltak som begrenser retten til å møtes, demonstrere eller samles? Har aktøren ytret støtte til overvåking, identifisering av eller statlig trakkasering av lovlydige individer på bakgrunn av at de møtes, demonstrerer eller samles?',
    ],
    søkestrategi: `
      Søk etter: religionslovgivning, statskirke, politiske partiforbud, sivilsamfunn,
      frivillig sektor vs. statlige løsninger, demonstrasjonsfrihet,
      organisasjonsfrihet, trossamfunn. Prioriter primærkilder.
    `,
  },
  {
    id: 'D6',
    navn: 'Digital autonomi og informasjonsfrihet',
    forankring:
      'Selveierskapet utvidet til digitalt liv (Locke), Hayek (informasjonsfrihet som forutsetning for spontan orden)',
    underdimensjoner: [
      '6.1 Overvåkning og personvern',
      '6.2 Digital identitet og kontroll',
      '6.3 Internettfrihet og kryptering',
      '6.4 Eierskap til egne data',
    ],
    beskrivelser: [
      'Har aktøren støttet masseovervåkning, datalagringspåbud eller statens tilgang til privat kommunikasjon uten domstolskjennelse?',
      'Støtter aktøren obligatoriske digitale ID-systemer, CBDC med programmerbar bruk, eller sosiale kredittmekanismer?',
      'Har aktøren støttet tiltak som begrenser kryptering, bakdører i kommunikasjonssystemer, eller statlig kontroll over internettinfrastruktur?',
      'Støtter aktøren individets rett til å eie og kontrollere egne data — eller fremmer aktøren statlig/korporativ datahøsting uten reelt samtykke?',
    ],
    søkestrategi: `
      Søk etter: datalagringsdirektivet, overvåkningslover, PST-fullmakter, digitalt ID,
      CBDC, krypteringspolitikk, personvern, GDPR-implementering, sosiale kredittmekanismer,
      datadeling, digital grenseovervåkning. Prioriter primærkilder.
    `,
  },
]
