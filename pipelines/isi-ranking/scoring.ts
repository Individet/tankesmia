import { DIMENSIONS, SUBDIMENSIONS } from './constants.ts'
import type {
  DimensionScoreSummary,
  ScoreDraft,
  SubdimensionScoreDraft,
} from './types.ts'

export const MIN_RAW_SUM = -48
export const MAX_RAW_SUM = 48

export function normalizeSubdimensionScore(score: unknown): number | null {
  if (score === null || score === undefined) {
    return null
  }

  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new Error(`Ugyldig scoreverdi: ${String(score)}`)
  }

  const rounded = Math.round(score)
  if (rounded < -2 || rounded > 2) {
    throw new Error(`Score maa vaere mellom -2 og 2 eller null. Fikk ${score}`)
  }

  return rounded
}

export function computeRawSum(
  subdimensions: Array<Pick<SubdimensionScoreDraft, 'score'>>,
): number {
  return subdimensions.reduce((sum, item) => sum + (item.score ?? 0), 0)
}

export function computeNormalizedScoreFromRawSum(rawSum: number): number {
  return Math.round(((rawSum - MIN_RAW_SUM) / (MAX_RAW_SUM - MIN_RAW_SUM)) * 100)
}

export function computeNormalizedScore(
  subdimensions: Array<Pick<SubdimensionScoreDraft, 'score'>>,
): number {
  const rawSum = computeRawSum(subdimensions)
  return computeNormalizedScoreFromRawSum(rawSum)
}

function roundTowardReasonablePrior(value: number): number {
  if (value >= 1.25) return 1
  if (value <= -1.25) return -1
  if (value > 0.25) return 1
  if (value < -0.25) return -1
  return 0
}

function inferEstimatedScore(item: SubdimensionScoreDraft, all: SubdimensionScoreDraft[]) {
  if (item.score !== null) {
    return {
      estimatedScore: item.score,
      imputationBasis: item.imputationBasis ?? 'none',
      imputationRationale: item.imputationRationale,
    }
  }

  const dimensionPrefix = item.subdimensionId.slice(0, 2)
  const sameDimension = all.filter(
    (candidate) =>
      candidate.subdimensionId.startsWith(dimensionPrefix) && candidate.score !== null,
  )
  const globalObserved = all.filter((candidate) => candidate.score !== null)

  const validCandidate =
    item.imputationCandidate === null || item.imputationCandidate === undefined
      ? null
      : normalizeSubdimensionScore(item.imputationCandidate)

  if (
    validCandidate !== null &&
    item.imputationBasis &&
    item.imputationBasis !== 'none'
  ) {
    return {
      estimatedScore: validCandidate,
      imputationBasis: item.imputationBasis,
      imputationRationale:
        item.imputationRationale ??
        'Imputert fra tilhorighet eller overordnet profil i scoringssteget.',
    }
  }

  if (sameDimension.length >= 2) {
    const dimensionAverage =
      sameDimension.reduce((sum, candidate) => sum + (candidate.score ?? 0), 0) /
      sameDimension.length
    return {
      estimatedScore: roundTowardReasonablePrior(dimensionAverage),
      imputationBasis: 'dimension-profile' as const,
      imputationRationale:
        item.imputationRationale ??
        'Imputert svakt fra observert profil i samme dimensjon.',
    }
  }

  if (globalObserved.length >= 8) {
    const globalAverage =
      globalObserved.reduce((sum, candidate) => sum + (candidate.score ?? 0), 0) /
      globalObserved.length
    return {
      estimatedScore: roundTowardReasonablePrior(globalAverage),
      imputationBasis: 'overall-profile' as const,
      imputationRationale:
        item.imputationRationale ??
        'Imputert svakt fra samlet observert ISI-profil.',
    }
  }

  return {
    estimatedScore: null,
    imputationBasis: 'none' as const,
    imputationRationale:
      item.imputationRationale ?? 'For lite grunnlag til å estimere underdimensjonen.',
  }
}

export function buildDimensionSummaries(
  subdimensions: SubdimensionScoreDraft[],
): DimensionScoreSummary[] {
  return DIMENSIONS.map((dimension) => {
    const dimensionScores = subdimensions.filter(
      (item) => item.subdimensionId.slice(0, 2) === dimension.id,
    )

    return {
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      observedRawSum: dimensionScores.reduce((sum, item) => sum + (item.score ?? 0), 0),
      estimatedRawSum: dimensionScores.reduce(
        (sum, item) => sum + (item.estimatedScore ?? 0),
        0,
      ),
      observedCount: dimensionScores.filter((item) => item.score !== null).length,
      dataGapCount: dimensionScores.filter((item) => item.score === null).length,
    }
  })
}

export function deriveConfidenceLevel(
  subdimensions: SubdimensionScoreDraft[],
): 'høy' | 'middels' | 'lav' {
  const total = SUBDIMENSIONS.length
  const dataGapCount = subdimensions.filter((item) => item.score === null).length
  const highConfidence = subdimensions.filter(
    (item) => item.score !== null && item.confidence === 'high',
  ).length

  if (dataGapCount <= 3 && highConfidence >= 12) {
    return 'høy'
  }

  if (dataGapCount <= 8) {
    return 'middels'
  }

  if (dataGapCount >= total / 2) {
    return 'lav'
  }

  return 'middels'
}

export function finalizeScoreDraft(
  partial: Omit<
    ScoreDraft,
    | 'generatedAt'
    | 'dimensionSummaries'
    | 'observedCount'
    | 'estimatedCount'
    | 'dataGapCount'
    | 'observedRawSum'
    | 'estimatedRawSum'
    | 'observedScore'
    | 'estimatedScore'
    | 'confidenceLevel'
  > & { generatedAt?: string },
  generatedAt: string,
): ScoreDraft {
  const normalizedSubdimensions = partial.subdimensions.map((item) => ({
    ...item,
    score: normalizeSubdimensionScore(item.score),
    imputationCandidate: normalizeSubdimensionScore(item.imputationCandidate),
  }))

  const estimatedSubdimensions = normalizedSubdimensions.map((item) => {
    const inferred = inferEstimatedScore(item, normalizedSubdimensions)
    return {
      ...item,
      estimatedScore: inferred.estimatedScore,
      imputationBasis: inferred.imputationBasis,
      imputationRationale: inferred.imputationRationale,
    }
  })

  const observedCount = estimatedSubdimensions.filter(
    (item) => item.score !== null,
  ).length
  const estimatedCount = estimatedSubdimensions.filter(
    (item) => item.estimatedScore !== null,
  ).length
  const dataGapCount = estimatedSubdimensions.length - observedCount
  const observedRawSum = computeRawSum(estimatedSubdimensions)
  const estimatedRawSum = estimatedSubdimensions.reduce(
    (sum, item) => sum + (item.estimatedScore ?? 0),
    0,
  )
  const observedScore = computeNormalizedScoreFromRawSum(observedRawSum)
  const estimatedScore = computeNormalizedScoreFromRawSum(estimatedRawSum)

  return {
    ...partial,
    generatedAt,
    subdimensions: estimatedSubdimensions,
    dimensionSummaries: buildDimensionSummaries(estimatedSubdimensions),
    observedCount,
    estimatedCount,
    dataGapCount,
    observedRawSum,
    estimatedRawSum,
    observedScore,
    estimatedScore,
    confidenceLevel: deriveConfidenceLevel(estimatedSubdimensions),
  }
}
