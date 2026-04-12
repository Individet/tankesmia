import { DIMENSIONS, SUBDIMENSIONS } from './constants.ts'
import type {
  ActorDossier,
  EvidenceArtifact,
  EvidenceMatrix,
  ResearchPlan,
  ScoreDraft,
  SubdimensionDefinition,
} from './types.ts'

function dimensionSummaryText(): string {
  return DIMENSIONS.map(
    (dimension) =>
      `- ${dimension.number}. ${dimension.name}: ${dimension.description} (${dimension.philosophicalBasis})`,
  ).join('\n')
}

function scoringRulesText(): string {
  return [
    'Scoreregler som aldri kan brytes:',
    '- Det finnes 24 underdimensjoner.',
    '- Hver underdimensjon skal ha score -2, -1, 0, 1, 2 eller null.',
    '- null betyr utilstrekkelig datagrunnlag.',
    '- 0 betyr dokumentert blandet eller balansert profil, ikke manglende data.',
    '- Vurder eksplisitte posisjoner høyere enn implisitte.',
    '- Gode intensjoner endrer ikke vurderingen av tvang.',
    '- Rapporter kun posisjoner du kan dokumentere. Marker alt annet som null.',
  ].join('\n')
}

export function buildResearchTools(maxWebSearches = 10) {
  return [
    {
      type: 'code_execution_20260120' as const,
      name: 'code_execution' as const,
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'web_search_20260209' as const,
      name: 'web_search' as const,
      allowed_callers: ['direct', 'code_execution_20260120'] as const,
      max_uses: maxWebSearches,
      user_location: {
        type: 'approximate' as const,
        city: 'Oslo',
        region: 'Oslo',
        country: 'NO',
        timezone: 'Europe/Oslo',
      },
    },
  ]
}

export function buildResearchPlanSystemPrompt(
  framework: string,
  manifest: string,
) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en research-planlegger for Individets Suverenitetsindeks (ISI).',
        'Lag en kostnadseffektiv researchplan som prioriterer søk som leder til primærkilder.',
        'Ikke foreslå søk du ikke forventer gir relevante treff.',
        scoringRulesText(),
        'Gjennomfør web-søk for hver underdimensjon. Prioriter troverdige primærkilder — aktørens egne skriverier, offentlige uttalelser og vedtak — og direkte sitater.',
        'Bruk folkelige, hverdagslige søkeord slik folk flest faktisk omtaler temaene. Unngå akademiske eller juridiske faguttrykk der det finnes et enklere, mer brukt alternativ.',
        'Prosjektmanifest:',
        manifest,
        'ISI-rammeverk:',
        framework,
        'Dimensjoner:',
        dimensionSummaryText(),
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildResearchPlanUserPrompt(dossier: ActorDossier): string {
  return [
    `Aktør: ${dossier.actor.name}`,
    `Type: ${dossier.actor.type}`,
    `Jurisdiksjon: ${dossier.jurisdiction}`,
    `Periode: ${dossier.period}`,
    dossier.actor.parti ? `Parti: ${dossier.actor.parti}` : null,
    dossier.actor.tilhørighet
      ? `Tilhørighet: ${dossier.actor.tilhørighet}`
      : null,
    dossier.actor.beskrivelse
      ? `Beskrivelse: ${dossier.actor.beskrivelse}`
      : null,
    `Aliaser: ${dossier.searchAliases.join(', ')}`,
    '',
    'Svar med JSON på denne formen:',
    JSON.stringify(
      {
        actorSlug: dossier.actorSlug,
        actorName: dossier.actor.name,
        profileSummary: '',
        primarySourcePriorities: [''],
        secondarySourcePriorities: [''],
        sourcePriorityNotes: [''],
        subdimensions: SUBDIMENSIONS.map((item) => ({
          subdimensionId: item.id,
          priority: 'high',
          rationale: '',
          searchQueries: [''],
          negativeQueries: [''],
          stopConditions: [''],
        })),
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildEvidenceHarvestSystemPrompt(
  framework: string,
  manifest: string,
) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en målrettet research-agent for Individets Suverenitetsindeks (ISI).',
        'Oppgaven er å finne få, sterke evidenspunkter for en enkelt underdimensjon.',
        scoringRulesText(),
        'Prioriter troverdige primærkilder — aktørens egne skriverier, offisielle uttalelser og vedtak — fremfor andrehåndskilder.',
        'Bruk folkelige, hverdagslige søkeord slik folk flest faktisk omtaler temaene. Unngå akademiske eller juridiske faguttrykk der det finnes et enklere, mer brukt alternativ.',
        'Referer til kilder via sitatmetadata. Brødteksten skal inneholde funn og analyse.',
        'Sett dataGap til true når du etter grundig søk finner utilstrekkelig grunnlag. Et ærlig hull er bedre enn spekulativ evidens.',
        'Ikke fabriker URL-er eller kilder du ikke har funnet gjennom søk.',
        'Prosjektmanifest:',
        manifest,
        'ISI-rammeverk:',
        framework,
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildEvidenceHarvestUserPrompt(
  dossier: ActorDossier,
  plan: ResearchPlan,
  subdimension: SubdimensionDefinition,
): string {
  const planEntry = plan.subdimensions.find(
    (item) => item.subdimensionId === subdimension.id,
  )

  return [
    `Aktør: ${dossier.actor.name}`,
    `Underdimensjon: ${subdimension.number} ${subdimension.name}`,
    `Beskrivelse: ${subdimension.description}`,
    `Prioritet: ${planEntry?.priority ?? 'medium'}`,
    `Planlagte søk: ${(planEntry?.searchQueries ?? []).join(' | ')}`,
    `Negative søk: ${(planEntry?.negativeQueries ?? []).join(' | ')}`,
    `Søkehints: ${subdimension.searchHints.join(' | ')}`,
    'Tips: Bruk hverdagslige, folkelige søkeord fremfor akademiske faguttrykk der det er mulig.',
    '',
    'Gyldige verdier: stance = positive|negative|mixed|unknown, confidence = high|medium|low, positionType = explicit|implicit|unknown, evidenceType = primary|secondary|mixed|unknown.',
    'Sett dataGap til true hvis du etter grundig søk mangler tilstrekkelig grunnlag.',
    '',
    'Returner JSON på denne formen:',
    JSON.stringify(
      {
        actorSlug: dossier.actorSlug,
        actorName: dossier.actor.name,
        subdimensionId: subdimension.id,
        subdimensionName: subdimension.name,
        summary: 'Kort oppsummering av funn for denne underdimensjonen.',
        stance: 'positive',
        positionType: 'explicit',
        confidence: 'high',
        dataGap: false,
        unresolvedQuestions: [''],
        findings: [
          {
            claim: 'Et konkret funn basert på primærkilde.',
            stance: 'positive',
            evidenceType: 'primary',
            positionType: 'explicit',
            confidence: 'high',
            timePattern: 'Konsistent over tid.',
            inconsistency: '',
            note: '',
          },
          {
            claim: 'Et svakere funn basert på sekundærkilde.',
            stance: 'negative',
            evidenceType: 'secondary',
            positionType: 'implicit',
            confidence: 'low',
            timePattern: '',
            inconsistency: 'Motstridende uttalelse i annen kontekst.',
            note: '',
          },
        ],
      },
      null,
      2,
    ),
  ].join('\n')
}

export function buildEvidenceReviewSystemPrompt(
  framework: string,
  manifest: string,
) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en evidensredaktør for Individets Suverenitetsindeks (ISI).',
        '',
        '## Din oppgave',
        '',
        'Du mottar en liste med 24 evidensartefakter (én per underdimensjon) for en enkelt aktør.',
        'Jobben din er å lage en strukturert evidence matrix ved å:',
        '1. Fjerne dupliserte funn (claims med identisk innhold eller kilde slås sammen til én).',
        '2. Rangere gjenværende funn etter kvalitet: primærkilder og eksplisitte posisjoner rangeres høyest.',
        '3. Skrive et kort narrativ per underdimensjon som oppsummerer aktørens dokumenterte posisjon.',
        '4. Markere hvilke claims du aksepterer (sterke, dokumenterte) og hvilke du forkaster (svake, spekulative, udokumenterte).',
        '5. Markere dataGap = true for underdimensjoner der evidensen er utilstrekkelig.',
        '6. Foreslå oppfølgingssøk for underdimensjoner med lav confidence eller datahull.',
        '',
        '## Regler for evidensvurdering',
        '',
        '- Primærkilder (stemmegivning, partiprogram, lovforslag) veier tyngre enn sekundærkilder (avisartikler, kommentarer).',
        '- Eksplisitte posisjoner (direkte utsagn, vedtak) veier tyngre enn implisitte (tilhørighet, partilinje).',
        '- Et konsistent mønster over tid veier tyngre enn enkelthendelser.',
        '- Behold alle URL-er og kildehenvisninger fra de opprinnelige artefaktene.',
        '- Rapporter kun posisjoner du kan dokumentere. Marker alt annet som datahull.',
        '',
        '## Output-format',
        '',
        'Returner JSON med nøyaktig dette skjemaet:',
        JSON.stringify(
          {
            actorName: 'Aktørens fulle navn',
            overallNarrative:
              'To til fire setninger som oppsummerer aktørens samlede profil på tvers av alle dimensjoner.',
            crossDimensionNotes: [
              'Merk: Aktøren er konsistent frihetsorientert på d1 og d2, men restriktiv på d6.',
              'Merk: Intern inkonsistens mellom ytringsfrihet (d2) og digital overvåkning (d6).',
            ],
            subdimensions: [
              {
                subdimensionId: 'd1_1',
                subdimensionName: 'Medisinsk selvbestemmelse',
                narrative:
                  'Aktøren stemte mot vaksineplikt i 2023 og har konsekvent forsvart pasientautonomi i partiprogram.',
                acceptedClaims: [
                  'Stemte mot vaksineplikt (stortinget.no, 2023)',
                  'Partiprogram 2021: «Individet bestemmer over egen helse»',
                ],
                discardedClaims: [
                  'Udokumentert påstand om uttalelse på Facebook (mangler kilde)',
                ],
                confidence: 'high',
                dataGap: false,
                recommendedFollowUpQueries: [],
                citations: [
                  {
                    url: 'https://stortinget.no/...',
                    title: 'Votering vaksineplikt',
                  },
                ],
              },
              {
                subdimensionId: 'd6_4',
                subdimensionName: 'Eierskap til egne data',
                narrative:
                  'Utilstrekkelig evidens til å vurdere aktørens posisjon.',
                acceptedClaims: [],
                discardedClaims: [],
                confidence: 'low',
                dataGap: true,
                recommendedFollowUpQueries: [
                  'aktørnavn dataeierskap GDPR',
                  'aktørnavn personvern digitale rettigheter',
                ],
                citations: [],
              },
            ],
          },
          null,
          2,
        ),
        '',
        'Returner nøyaktig 24 underdimensjoner i subdimensions-arrayet, én per underdimensjon (d1_1 til d6_4).',
        'Confidence skal være high, medium eller low. Sett dataGap til true for underdimensjoner med utilstrekkelig evidens.',
        '',
        '## Prosjektkontekst',
        '',
        manifest,
        '',
        '## ISI-rammeverk',
        '',
        framework,
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildEvidenceReviewUserPrompt(
  actorName: string,
  evidenceArtifacts: EvidenceArtifact[],
): string {
  return [
    `Lag evidence matrix for ${actorName}.`,
    `Kildematerialet inneholder ${evidenceArtifacts.length} underdimensjonsartefakter.`,
    'Gå gjennom hver artefakt, fjern duplikater, ranger funn etter kvalitet, og skriv et kort narrativ per underdimensjon.',
    '',
    'Kildematerialet:',
    JSON.stringify(evidenceArtifacts, null, 2),
  ].join('\n')
}

export function buildScoringSystemPrompt(framework: string, manifest: string) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en ISI-scorer for Individets Suverenitetsindeks.',
        'Tildel observed score for alle 24 underdimensjoner. Ikke regn ut totalscore — det gjøres automatisk av pipelinen.',
        scoringRulesText(),
        '',
        '## Imputering ved datahull',
        '',
        'Når observed score er null (datahull), foreslå en svak imputationCandidate basert på partitilhørighet, organisasjonstilhørighet, mønster innen samme dimensjon eller samlet profil.',
        'Sett imputationCandidate til -1, 0 eller 1 — aldri -2 eller +2.',
        'Sett imputationBasis til party-alignment, organization-alignment, dimension-profile, overall-profile eller none.',
        'La observed score stå som null. Ikke erstatt null med en gjettet score — imputering registreres kun i imputationCandidate.',
        '',
        '## Output-format',
        '',
        'Eksempel på forventet output:',
        JSON.stringify(
          {
            actorSlug: 'aktør-slug',
            actorName: 'Aktørens fulle navn',
            subdimensions: [
              {
                subdimensionId: 'd1_1',
                subdimensionName: 'Medisinsk selvbestemmelse',
                score: 1,
                rationale:
                  'Konsekvent forsvar for pasientautonomi og motstand mot vaksineplikt.',
                confidence: 'high',
                conflictingEvidence: false,
              },
              {
                subdimensionId: 'd6_4',
                subdimensionName: 'Eierskap til egne data',
                score: null,
                rationale: 'Utilstrekkelig evidens til å sette score.',
                confidence: 'low',
                conflictingEvidence: false,
                imputationCandidate: 1,
                imputationBasis: 'party-alignment',
                imputationRationale:
                  'Partiprogrammet støtter individets dataeierskap.',
              },
            ],
            keyStrengths: ['Konsekvent på kroppslig autonomi (d1)'],
            keyRisks: ['Tynn dekning på digital autonomi (d6)'],
            crossDimensionNotes: [
              'Frihetsprofilen er sterkest i d1-d2, svakere i d5-d6.',
            ],
          },
          null,
          2,
        ),
        '',
        'Returner nøyaktig 24 subdimensions-poster, én per underdimensjon (d1_1 til d6_4).',
        '',
        '## Prosjektkontekst',
        '',
        manifest,
        '',
        '## ISI-rammeverk',
        '',
        framework,
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildScoringUserPrompt(
  dossier: ActorDossier,
  matrix: EvidenceMatrix,
): string {
  return [
    `Scor aktøren ${matrix.actorName} basert på evidence matrix-en nedenfor.`,
    'Bruk dossier-informasjonen (parti, tilhørighet) som kontekst ved imputering av null-verdier.',
    '',
    'Dossier:',
    JSON.stringify(dossier, null, 2),
    '',
    'Evidence matrix:',
    JSON.stringify(matrix, null, 2),
    '',
    'Scor alle 24 underdimensjoner (d1_1 til d6_4) med score, rationale, confidence og conflictingEvidence. Legg til imputation-felter for null-scorer.',
  ].join('\n')
}

export function buildGapResearchSystemPrompt(
  framework: string,
  manifest: string,
) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en oppfølgings-research-agent for Individets Suverenitetsindeks (ISI).',
        'Jobben din er å gjøre målrettede oppfølgingssøk for underdimensjoner som har lav confidence, manglende score eller motstridende evidens fra første runde.',
        'Forsøk nye søkeinnfallsvinkler og andre kilder enn første runde. Ikke gjenta søk eller kilder fra første runde. Prioriter primærkilder og aktørens egne skriverier.',
        'Bruk folkelige, hverdagslige søkeord slik folk flest faktisk omtaler temaene. Unngå akademiske eller juridiske faguttrykk der det finnes et enklere, mer brukt alternativ.',
        'Rapporter ærlig om gapet fortsatt er åpent etter oppfølgingssøket.',
        scoringRulesText(),
        '',
        'Eksempel på forventet output:',
        JSON.stringify(
          {
            actorSlug: '',
            actorName: '',
            subdimensionId: '',
            subdimensionName: '',
            summary: 'Oppsummering av oppfølgingsfunn.',
            stance: 'positive',
            positionType: 'explicit',
            confidence: 'medium',
            dataGap: false,
            unresolvedQuestions: [''],
            findings: [
              {
                claim: '',
                stance: 'positive',
                evidenceType: 'primary',
                positionType: 'explicit',
                confidence: 'medium',
                timePattern: '',
                inconsistency: '',
                note: '',
              },
            ],
          },
          null,
          2,
        ),
        '',
        'Prosjektmanifest:',
        manifest,
        '',
        'ISI-rammeverk:',
        framework,
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildGapResearchUserPrompt(
  dossier: ActorDossier,
  subdimension: SubdimensionDefinition,
  reasonLines: string[],
  previousEvidence?: EvidenceArtifact,
): string {
  const lines = [
    `Aktør: ${dossier.actor.name}`,
    `Underdimensjon: ${subdimension.number} ${subdimension.name}`,
    `Beskrivelse: ${subdimension.description}`,
    '',
    'Bakgrunn for oppfølgingssøket:',
    ...reasonLines.map((line) => `- ${line}`),
  ]

  if (previousEvidence) {
    lines.push(
      '',
      'Funn fra første runde (unngå å gjenta de samme kildene):',
      JSON.stringify(previousEvidence, null, 2),
    )
  }

  lines.push(
    '',
    'Gjennomfør oppfølgingssøk med nye innfallsvinkler og rapporter resultatet.',
  )

  return lines.join('\n')
}

export function buildFinalReportSystemPrompt(
  framework: string,
  manifest: string,
) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en analytisk agent for tankesmien Individet.',
        'Skriv den endelige rapporten utelukkende fra det kuraterte grunnlaget du får.',
        scoringRulesText(),
        'ObservedScore og EstimatedScore er allerede regnet ut av pipelinen. Bruk de vedlagte verdiene direkte.',
        'ObservedScore er den direkte observerte scoren. EstimatedScore inkluderer transparent imputering for null-verdier.',
        'Du vil få en mal som allerede er preutfylt programmatisk med YAML frontmatter, scorer, datagap og kilder.',
        'Behold de preutfylte YAML-verdiene og kildelistene. Ikke endre YAML frontmatter med mindre det er en åpenbar intern selvmotsigelse i inputen.',
        'YAML-verdiene i malen er autoritative. JSON-grunnlaget er kontekst for prosaen.',
        'Fyll ut alle plassholderne i malen. Behold YAML-verdiene uendret. Skriv analytisk prosa i brødtekstfeltene. Følg malens strukturelle inndeling nøyaktig.',
        'Returner kun markdown med YAML frontmatter.',
        '',
        'Prosjektmanifest:',
        manifest,
        '',
        'ISI-rammeverk:',
        framework,
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildFinalReportUserPrompt(
  dossier: ActorDossier,
  matrix: EvidenceMatrix,
  scoreDraft: ScoreDraft,
  prefilledTemplate: string,
): string {
  return [
    `Skriv ferdig ISI-rapport for ${dossier.actor.name}.`,
    'Bruk observedScore, estimatedScore, kildelister og alle underdimensjonsscorer nøyaktig slik de er oppgitt her.',
    'Her er den preutfylte malen du skal ferdigstille:',
    prefilledTemplate,
    '',
    'Her er det strukturerte grunnlaget:',
    JSON.stringify(
      {
        dossier,
        matrix,
        scoreDraft,
      },
      null,
      2,
    ),
  ].join('\n')
}
