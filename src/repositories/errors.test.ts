// Conversion des erreurs base en erreurs typées (D10) : les marqueurs des
// triggers `trips` (posés en M9, notes de session) doivent arriver côté client
// dans le bon code, avec un message FR. Pur et local (D23).
import { describe, expect, it } from 'vitest'
import { DataError, toDataError, TripError } from '@/repositories/errors'

/** Une erreur de trigger SQL : P0001 avec le marqueur en préfixe du message. */
function p0001(raw: string) {
  return { code: 'P0001', message: raw }
}

describe('toDataError — marqueurs sortie (M9 → M10)', () => {
  const cases: Array<[string, string]> = [
    ['TRIP_KM_ORDER: km 49 < km départ 50 (D34).', 'trip_km_order'],
    ['TRIP_DATE_ORDER: date arrivée < date départ (D34).', 'trip_date_order'],
    ['TRIP_RELAY_CONFLICT: le relais échoue (D35).', 'trip_relay_conflict'],
    [
      'TRIP_IMMUTABLE: sortie clôturée ne se réouvre pas (D33).',
      'trip_immutable',
    ],
    [
      'TRIP_ADMIN_ONLY: levée réservée à l\u2019admin (D36).',
      'trip_admin_only',
    ],
  ] as const

  it.each(cases)('%s → %s', (raw, code) => {
    const error = toDataError(p0001(raw))
    expect(error).toBeInstanceOf(TripError)
    expect(error).toBeInstanceOf(DataError) // les appelants existants marchent
    expect(error.code).toBe(code)
    expect(error.message).toMatch(/\S/) // message FR, jamais vide
  })

  it('violation UNIQUE start_reading_id : rejeu d’ouverture reconnu (D39)', () => {
    const error = toDataError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint ' +
        '"trips_start_reading_id_key"',
    })
    expect(error).toBeInstanceOf(TripError)
    expect(error.code).toBe('trip_already_open')
  })

  it('violation index une-sortie-ouverte : course du relais (D35)', () => {
    const error = toDataError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "trips_one_open_per_vehicle"',
    })
    expect(error.code).toBe('trip_concurrent_open')
  })

  it('un 23505 d’une autre contrainte n’est pas une erreur sortie', () => {
    const error = toDataError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "kilometers_pkey"',
    })
    expect(error).not.toBeInstanceOf(TripError)
    expect(error.code).toBe('unknown')
  })

  it('les marqueurs relevés existants gardent leur code (non-régression M4)', () => {
    expect(toDataError(p0001('KM_REGRESSION: …')).code).toBe('km_regression')
    expect(toDataError(p0001('KM_IMMUTABLE: …')).code).toBe('km_immutable')
  })
})
