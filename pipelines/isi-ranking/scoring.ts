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

export function computeNormalizedScore(
  subdimensions: Array<Pick<SubdimensionScoreDraft, 'score'>>,
): number {
  const rawSum = computeRawSum(subdimensions)
  return Math.round(((rawSum - MIN_RAW_SUM) / (MAX_RAW_SUM - MIN_RAW_SUM)) * 100)
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
      rawSum: dimensionScores.reduce((sum, item) => sum + (item.score ?? 0), 0),
      evaluatedCount: dimensionScores.filter((item) => item.score !== null).length,
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
    | 'evaluatedCount'
    | 'dataGapCount'
    | 'rawSum'
    | 'normalizedScore'
    | 'confidenceLevel'
  > & { generatedAt?: string },
  generatedAt: string,
): ScoreDraft {
  const normalizedSubdimensions = partial.subdimensions.map((item) => ({
    ...item,
    score: normalizeSubdimensionScore(item.score),
  }))

  const evaluatedCount = normalizedSubdimensions.filter(
    (item) => item.score !== null,
  ).length
  const dataGapCount = normalizedSubdimensions.length - evaluatedCount
  const rawSum = computeRawSum(normalizedSubdimensions)
  const normalizedScore = computeNormalizedScore(normalizedSubdimensions)

  return {
    ...partial,
    generatedAt,
    subdimensions: normalizedSubdimensions,
    dimensionSummaries: buildDimensionSummaries(normalizedSubdimensions),
    evaluatedCount,
    dataGapCount,
    rawSum,
    normalizedScore,
    confidenceLevel: deriveConfidenceLevel(normalizedSubdimensions),
  }
}
