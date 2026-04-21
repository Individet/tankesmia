import { describe, expect, it } from 'vitest'
import { SUBDIMENSIONS } from './constants.ts'
import {
  computeNormalizedScore,
  finalizeScoreDraft,
} from './scoring.ts'

function buildScores(score: number | null) {
  return SUBDIMENSIONS.map((item) => ({
    subdimensionId: item.id,
    subdimensionName: item.name,
    score,
    rationale: 'Test',
    confidence: 'high' as const,
    conflictingEvidence: false,
  }))
}

describe('isi-ranking scoring', () => {
  it('maps all -2 scores to normalized score 0', () => {
    expect(computeNormalizedScore(buildScores(-2))).toBe(0)
  })

  it('maps all +2 scores to normalized score 100', () => {
    expect(computeNormalizedScore(buildScores(2))).toBe(100)
  })

  it('maps all 0 scores to normalized score 50', () => {
    expect(computeNormalizedScore(buildScores(0))).toBe(50)
  })

  it('preserves null as data gap while still computing totals in code', () => {
    const partial = finalizeScoreDraft(
      {
        actorSlug: 'test-person',
        actorName: 'Test Person',
        subdimensions: SUBDIMENSIONS.map((item, index) => ({
          subdimensionId: item.id,
          subdimensionName: item.name,
          score: index === 0 ? 2 : null,
          rationale: 'Test rationale',
          confidence: index === 0 ? ('high' as const) : ('low' as const),
          conflictingEvidence: false,
          imputationCandidate: index === 1 ? -1 : null,
          imputationBasis: index === 1 ? ('party-alignment' as const) : ('none' as const),
          imputationRationale: index === 1 ? 'Party prior' : 'No basis',
        })),
        keyStrengths: ['Strong on one issue'],
        keyRisks: ['Many data gaps'],
        crossDimensionNotes: [],
      },
      '2026-04-11T00:00:00.000Z',
    )

    expect(partial.dataGapCount).toBe(23)
    expect(partial.observedCount).toBe(1)
    expect(partial.observedRawSum).toBe(2)
    expect(partial.observedScore).toBe(52)
    expect(partial.subdimensions[1]?.score).toBeNull()
    expect(partial.subdimensions[1]?.estimatedScore).toBe(-1)
    expect(partial.subdimensions[1]?.imputationBasis).toBe('party-alignment')
    expect(partial.estimatedCount).toBeGreaterThanOrEqual(2)
    expect(partial.estimatedScore).not.toBe(partial.observedScore)
  })

  it('falls back to dimension or overall profile when null lacks explicit imputering', () => {
    const partial = finalizeScoreDraft(
      {
        actorSlug: 'test-person',
        actorName: 'Test Person',
        subdimensions: SUBDIMENSIONS.map((item, index) => ({
          subdimensionId: item.id,
          subdimensionName: item.name,
          score: index < 4 ? 1 : index === 4 ? null : 1,
          rationale: 'Test rationale',
          confidence: 'high' as const,
          conflictingEvidence: false,
          imputationBasis: 'none' as const,
        })),
        keyStrengths: ['Mostly positive'],
        keyRisks: [],
        crossDimensionNotes: [],
      },
      '2026-04-11T00:00:00.000Z',
    )

    expect(partial.subdimensions[4]?.score).toBeNull()
    expect(partial.subdimensions[4]?.estimatedScore).toBe(1)
    expect(['dimension-profile', 'overall-profile']).toContain(
      partial.subdimensions[4]?.imputationBasis,
    )
    expect(partial.estimatedScore).toBeGreaterThan(partial.observedScore)
  })
})
