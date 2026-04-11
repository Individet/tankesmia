import type { DimensionDefinition, SubdimensionDefinition } from './types.ts'

export const DEFAULT_ACTOR_FILE = 'pipelines\\isi-rangering\\actors.json'
export const DEFAULT_OUTPUT_DIR = 'output\\isi-ranking'
export const DEFAULT_MANIFEST_FILE = 'manifest-kondensert.md'
export const DEFAULT_FRAMEWORK_FILE = 'skills\\isi-scoring\\references\\ISI.md'
export const DEFAULT_TEMPLATE_FILE = 'skills\\isi-scoring\\references\\template.md'

export const MODELS = {
  researchPlan: 'claude-sonnet-4-6',
  evidenceHarvest: 'claude-sonnet-4-6',
  evidenceReview: 'claude-haiku-4-5',
  evidenceReviewEscalation: 'claude-sonnet-4-6',
  scoringDraft: 'claude-sonnet-4-6',
  gapResearch: 'claude-sonnet-4-6',
  finalReport: 'claude-opus-4-6',
} as const

export const DIMENSIONS: DimensionDefinition[] = [
  {
    id: 'd1',
    number: '1',
    name: 'Kroppslig autonomi og selvbestemmelse',
    philosophicalBasis:
      'Locke (selveierskapet), Rothbard (selveierskapsaksiomet), Mill (skadeprinsippet)',
    description: 'Vurderer kontroll over egen kropp, livsstil, bevegelse og livets slutt.',
  },
  {
    id: 'd2',
    number: '2',
    name: 'Ytringsfrihet og intellektuell autonomi',
    philosophicalBasis:
      'Mill (On Liberty), Hayek (spontan orden i ideer), Spooner (naturlig rett til ytring)',
    description: 'Vurderer innholdsregulering, pressefrihet, akademisk frihet og digitale ytringsrom.',
  },
  {
    id: 'd3',
    number: '3',
    name: 'Eiendomsrett og økonomisk frihet',
    philosophicalBasis:
      'Locke (arbeidsteori for eiendom), Bastiat (eiendom som pre-politisk), Nozick (berettigelsesteorien)',
    description: 'Vurderer skatt, ekspropriering, regulering, handel og monetær frihet.',
  },
  {
    id: 'd4',
    number: '4',
    name: 'Rettsstat og likebehandling',
    philosophicalBasis:
      'Cicero (lex naturalis), Hayek (upersonlige regler), Bastiat (loven som vern, ikke plyndring)',
    description: 'Vurderer likebehandling, domstolsuavhengighet, rettssikkerhet og begrenset statsmakt.',
  },
  {
    id: 'd5',
    number: '5',
    name: 'Forenings-, forsamlings- og religionsfrihet',
    philosophicalBasis:
      'Hayek (spontan orden i sivilsamfunnet), Lane/Paterson (sivilsamfunn som alternativ til staten)',
    description: 'Vurderer religionsfrihet, politisk foreningsfrihet, sivilsamfunn og forsamlingsfrihet.',
  },
  {
    id: 'd6',
    number: '6',
    name: 'Digital autonomi og informasjonsfrihet',
    philosophicalBasis:
      'Selveierskapet utvidet til digitalt liv (Locke), Hayek (informasjonsfrihet som forutsetning for spontan orden)',
    description: 'Vurderer overvåkning, digital kontroll, kryptering og eierskap til egne data.',
  },
]

export const SUBDIMENSIONS: SubdimensionDefinition[] = [
  {
    id: 'd1_1',
    number: '1.1',
    name: 'Medisinsk selvbestemmelse',
    dimensionId: 'd1',
    description:
      'Støtter aktøren individets rett til egne medisinske beslutninger uten statlig tvang?',
    searchHints: ['vaksineplikt', 'koronarestriksjoner', 'pasientrettigheter', 'medisinsk frihet'],
  },
  {
    id: 'd1_2',
    number: '1.2',
    name: 'Sosial frihet og livsstilsautonomi',
    dimensionId: 'd1',
    description:
      'Fremmer aktøren retten til å velge livsstil uten statlig innblanding når ingen tredjepart skades?',
    searchHints: ['ruspolitikk', 'seksualitet', 'familieliv', 'livsstilsfrihet'],
  },
  {
    id: 'd1_3',
    number: '1.3',
    name: 'Bevegelsesfrihet',
    dimensionId: 'd1',
    description:
      'Støtter aktøren fri bevegelse, inkludert retten til å forlate et land, bosette seg og arbeide?',
    searchHints: ['innvandring', 'Schengen', 'grensekontroll', 'bevegelsesfrihet'],
  },
  {
    id: 'd1_4',
    number: '1.4',
    name: 'Selvbestemmelse ved livets slutt',
    dimensionId: 'd1',
    description:
      'Anerkjenner aktøren individets rett til å bestemme over eget livs avslutning?',
    searchHints: ['eutanasi', 'assistert død', 'aktiv dødshjelp'],
  },
  {
    id: 'd2_1',
    number: '2.1',
    name: 'Ytringsfrihet - innhold',
    dimensionId: 'd2',
    description:
      'Har aktøren støttet regulering som begrenser lovlig ytring basert på innhold?',
    searchHints: ['hatytringer', 'blasfemi', 'desinformasjon', 'ytringsfrihet'],
  },
  {
    id: 'd2_2',
    number: '2.2',
    name: 'Pressefrihet og redaksjonell uavhengighet',
    dimensionId: 'd2',
    description:
      'Støtter aktøren ordninger som skaper medieavhengighet eller inngrep i redaksjonelle beslutninger?',
    searchHints: ['mediestøtte', 'pressefrihet', 'redaksjonell uavhengighet', 'NRK'],
  },
  {
    id: 'd2_3',
    number: '2.3',
    name: 'Akademisk og vitenskapelig frihet',
    dimensionId: 'd2',
    description:
      'Har aktøren støttet posisjoner som underlegger forskning eller akademia politisk kontroll?',
    searchHints: ['akademisk frihet', 'forskning', 'universitet', 'vitenskapelig frihet'],
  },
  {
    id: 'd2_4',
    number: '2.4',
    name: 'Ytringsfrihet på digitale plattformer',
    dimensionId: 'd2',
    description:
      'Støtter aktøren statlig regulering av private plattformers innholdsmoderering eller avplattforming av lovlige ytringer?',
    searchHints: ['plattformregulering', 'moderering', 'avplattforming', 'sosiale medier'],
  },
  {
    id: 'd3_1',
    number: '3.1',
    name: 'Eiendomsvern, skatt og ekspropriering',
    dimensionId: 'd3',
    description:
      'Støtter aktøren ekspropriasjon eller skatt som omfordelingsinstrument utover strenge grenser?',
    searchHints: ['formuesskatt', 'eiendomsskatt', 'ekspropriering', 'skattepolitikk'],
  },
  {
    id: 'd3_2',
    number: '3.2',
    name: 'Næringsfrihet og regulering',
    dimensionId: 'd3',
    description:
      'Støtter aktøren tiltak som gjør det vanskeligere å starte, drive eller avslutte virksomhet?',
    searchHints: ['arbeidsmiljøloven', 'regulering', 'næringsfrihet', 'kontraktsfrihet'],
  },
  {
    id: 'd3_3',
    number: '3.3',
    name: 'Handelsfrihet',
    dimensionId: 'd3',
    description:
      'Støtter aktøren proteksjonisme, toll eller eksportkontroll som primær næringspolitikk?',
    searchHints: ['toll', 'proteksjonisme', 'frihandel', 'eksportkontroll'],
  },
  {
    id: 'd3_4',
    number: '3.4',
    name: 'Monetaer frihet',
    dimensionId: 'd3',
    description:
      'Støtter aktøren prisregulering, statlig pengemonopol eller digitale sentralbankpenger med kontrollformaal?',
    searchHints: ['CBDC', 'prisregulering', 'sentralbankpenger', 'monetaer politikk'],
  },
  {
    id: 'd4_1',
    number: '4.1',
    name: 'Lik anvendelse av loven',
    dimensionId: 'd4',
    description:
      'Støtter aktøren saerbehandling som bryter med likebehandlingsprinsippet?',
    searchHints: ['kvotering', 'positiv diskriminering', 'likebehandling'],
  },
  {
    id: 'd4_2',
    number: '4.2',
    name: 'Rettslig uavhengighet',
    dimensionId: 'd4',
    description:
      'Har aktøren forsøkt aa paavirke domstolsavgjoerelser eller politisere juridiske prosesser?',
    searchHints: ['domstol', 'rettsvesen', 'rettslig uavhengighet'],
  },
  {
    id: 'd4_3',
    number: '4.3',
    name: 'Rettssikkerhet og uskyldspresumpsjon',
    dimensionId: 'd4',
    description:
      'Støtter aktøren administrative sanksjoner eller tiltak som omgaer rettsprosessen?',
    searchHints: ['administrative sanksjoner', 'bevisbyrde', 'rettssikkerhet'],
  },
  {
    id: 'd4_4',
    number: '4.4',
    name: 'Begrenset statsmakt',
    dimensionId: 'd4',
    description:
      'Støtter aktøren konstitusjonelle begrensninger paa statsmakten eller fullmaktslover og noedrett?',
    searchHints: ['fullmaktslov', 'noedrett', 'statsmakt', 'maktbegrensning'],
  },
  {
    id: 'd5_1',
    number: '5.1',
    name: 'Religionsfrihet',
    dimensionId: 'd5',
    description:
      'Støtter aktøren statlig regulering av religiøs praksis eller privilegering av en tradisjon?',
    searchHints: ['religionsfrihet', 'trossamfunn', 'sekularisme'],
  },
  {
    id: 'd5_2',
    number: '5.2',
    name: 'Politisk foreningsfrihet',
    dimensionId: 'd5',
    description:
      'Støtter aktøren forbud eller regulering av politiske bevegelser basert paa ideologisk innhold?',
    searchHints: ['partiforbud', 'organisasjonsfrihet', 'politisk forening'],
  },
  {
    id: 'd5_3',
    number: '5.3',
    name: 'Sivilsamfunn versus statlig substitusjon',
    dimensionId: 'd5',
    description:
      'Fremmer aktøren statlige løsninger der frivillig sivilsamfunn historisk har fylt behovet?',
    searchHints: ['frivillig sektor', 'sivilsamfunn', 'statlige loesninger'],
  },
  {
    id: 'd5_4',
    number: '5.4',
    name: 'Forsamlingsfrihet',
    dimensionId: 'd5',
    description:
      'Har aktøren støttet tiltak som begrenser retten til aa møtes, demonstrere eller samles?',
    searchHints: ['demonstrasjon', 'forsamlingsfrihet', 'overvaakning av demonstranter'],
  },
  {
    id: 'd6_1',
    number: '6.1',
    name: 'Overvaakning og personvern',
    dimensionId: 'd6',
    description:
      'Har aktøren støttet masseovervaakning, datalagringspaabud eller tilgang til privat kommunikasjon uten domstolskjennelse?',
    searchHints: ['datalagring', 'PST', 'overvaakning', 'personvern'],
  },
  {
    id: 'd6_2',
    number: '6.2',
    name: 'Digital identitet og kontroll',
    dimensionId: 'd6',
    description:
      'Støtter aktøren obligatoriske digitale ID-systemer, programmerbar valuta eller sosiale kredittmekanismer?',
    searchHints: ['digital ID', 'ID-wallet', 'CBDC', 'sosial kreditt'],
  },
  {
    id: 'd6_3',
    number: '6.3',
    name: 'Internettfrihet og kryptering',
    dimensionId: 'd6',
    description:
      'Har aktøren støttet tiltak som begrenser kryptering, bakdoerer eller statlig kontroll over internettinfrastruktur?',
    searchHints: ['kryptering', 'bakdoer', 'internettkontroll'],
  },
  {
    id: 'd6_4',
    number: '6.4',
    name: 'Eierskap til egne data',
    dimensionId: 'd6',
    description:
      'Støtter aktøren individets rett til aa eie og kontrollere egne data?',
    searchHints: ['dataeierskap', 'datadeling', 'samtykke', 'GDPR'],
  },
]

export const SUBDIMENSION_IDS = SUBDIMENSIONS.map((item) => item.id)
