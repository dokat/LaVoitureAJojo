// @vitest-environment jsdom
// Règle D6 côté client : la matrice des cas du contrat (égalité acceptée,
// rétro-saisie acceptée, recul à date postérieure ou égale refusé), plus le
// branchement du hook sur un dernier relevé qui change.
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  useOdometerValidation,
  validateOdometer,
  type OdometerPoint,
} from '@/hooks/useOdometerValidation'

const last: OdometerPoint = {
  km: 50000,
  readingAt: new Date('2026-11-20T10:00:00'),
}

const at = (iso: string) => new Date(iso)

describe('validateOdometer — règle D6', () => {
  it('accepte tout relevé quand il n\u2019y a pas encore de dernier', () => {
    expect(
      validateOdometer({ km: 100, readingAt: at('2020-01-01') }, null),
    ).toEqual({ ok: true })
  })

  it('accepte km supérieur, quelle que soit la date', () => {
    expect(
      validateOdometer({ km: 51000, readingAt: last.readingAt }, last),
    ).toEqual({ ok: true })
    expect(
      validateOdometer({ km: 51000, readingAt: at('2010-01-01') }, last),
    ).toEqual({ ok: true })
  })

  it('accepte l\u2019égalité de kilométrage (D6 explicite)', () => {
    expect(
      validateOdometer({ km: 50000, readingAt: last.readingAt }, last),
    ).toEqual({ ok: true })
  })

  it('accepte une rétro-saisie : km inférieur avec date strictement antérieure', () => {
    expect(
      validateOdometer(
        { km: 49000, readingAt: at('2026-11-19T23:59:59') },
        last,
      ),
    ).toEqual({ ok: true })
  })

  it('refuse km inférieur à date identique (deux saisies le même instant)', () => {
    const verdict = validateOdometer(
      { km: 49999, readingAt: last.readingAt },
      last,
    )
    expect(verdict.ok).toBe(false)
    expect(verdict).toMatchObject({ reason: 'regression' })
  })

  it('refuse km inférieur à date postérieure (« remettre le compteur à l\u2019heure »)', () => {
    expect(
      validateOdometer({ km: 300, readingAt: at('2026-12-31T23:00:00') }, last),
    ).toMatchObject({ reason: 'regression' })
  })

  it('le message de refus cite les deux km et la piste de correction', () => {
    const verdict = validateOdometer(
      { km: 49000, readingAt: last.readingAt },
      last,
    )
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.message).toContain('49') // 49 000 formaté fr
      expect(verdict.message).toContain('50') // 50 000
      expect(verdict.message).toMatch(/antérieure.*suppression puis ressaisie/s)
    }
  })

  it('rejette un km invalide avant toute comparaison', () => {
    for (const km of [NaN, -1, 12.5, Infinity]) {
      expect(
        validateOdometer({ km, readingAt: last.readingAt }, last),
      ).toMatchObject({ ok: false, reason: 'invalid_km' })
    }
  })

  it('rejette une date non représentable (le D6 SQL comparerait du NULL)', () => {
    expect(
      validateOdometer({ km: 50001, readingAt: at('pas une date') }, last),
    ).toMatchObject({ ok: false, reason: 'invalid_km' })
  })
})

describe('useOdometerValidation — branchement sur le dernier relevé', () => {
  it('suit les changements de dernier relevé (pas de closure obsolète)', () => {
    const { result, rerender } = renderHook(
      ({ point }: { point: OdometerPoint | null }) =>
        useOdometerValidation(point),
      { initialProps: { point: last } },
    )

    expect(
      result.current({ km: 49000, readingAt: at('2026-12-01T00:00:00') }),
    ).toMatchObject({ ok: false })

    // Le dernier relevé devient une rétro-saisie antérieure : le même
    // candidat est maintenant refusé face à un km plus bas, accepté face à…
    rerender({ point: { km: 48000, readingAt: at('2026-11-10T08:00:00') } })
    expect(
      result.current({ km: 49000, readingAt: at('2026-12-01T00:00:00') }),
    ).toEqual({ ok: true })
  })
})
