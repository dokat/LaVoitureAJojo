// Sequences d'écritures de l'agrégat sortie (D30-D37) figées à la frontière
// supabase-js (D23) : ordre des insertions d'openTrip, idempotence du rejeu,
// branches de restoreTrip, contagion de deleteTrip. Les gardes base (relais,
// D34, RLS) ont leurs scripts SQL (M9) — ici on ne juge QUE ce que le client
// écrit, dans quel ordre.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{
    table: string
    ops: Array<[string, unknown[]]>
  }>,
  results: [] as Array<{ data?: unknown; error?: unknown }>,
  insertReading: vi.fn(),
  softDeleteReading: vi.fn(),
  restoreReading: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, ops: [] as Array<[string, unknown[]]> }
      mocks.calls.push(entry)
      let mode = 'then'
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'is', 'order', 'limit', 'neq']) {
        query[method] = (...args: unknown[]) => {
          entry.ops.push([method, args])
          return query
        }
      }
      for (const method of ['insert', 'update']) {
        query[method] = (value: unknown) => {
          entry.ops.push([method, [value]])
          return query
        }
      }
      // Le vrai PostgrestBuilder est « thenable » : l'attente résout la
      // file d'attente de requêtes. Même contrat ici.
      query.then = (
        onFulfilled: ((v: unknown) => unknown) | undefined,
        onRejected?: ((e: unknown) => unknown) | undefined,
      ) =>
        Promise.resolve()
          .then(() => {
            const result = mocks.results.shift() ?? { data: null, error: null }
            entry.ops.push([mode, []])
            return result
          })
          .then(onFulfilled, onRejected)
      query.single = () => {
        mode = 'single'
        return query
      }
      query.maybeSingle = () => {
        mode = 'maybeSingle'
        return query
      }
      return query
    },
  },
}))

vi.mock('@/repositories/kilometersRepository', () => ({
  insertReading: mocks.insertReading,
  softDeleteReading: mocks.softDeleteReading,
  restoreReading: mocks.restoreReading,
  attachPhoto: vi.fn(),
  listReadings: vi.fn(),
  getLatestReading: vi.fn(),
}))

import * as kilometersRepository from '@/repositories/kilometersRepository'
import { TripError } from '@/repositories/errors'
import * as tripsRepository from '@/repositories/tripsRepository'
import type { Trip } from '@/schemas/trips'

// UUID v4 valides (z.uuid() vérifie les bits — piège des fixtures M5).
const VEHICLE = '22222222-2222-4222-8222-222222222222'
const START = '33333333-3333-4333-8333-333333333333'
const END = '44444444-4444-4444-8444-444444444444'
const TRIP = '55555555-5555-4555-8555-555555555555'
// Ids de relevés RENVOYÉS par les mocks — des UUID valides, sinon le schéma
// zod (D26) les refuse : piège des fixtures déjà noté en M5.
const R_NEW = '66666666-6666-4666-8666-666666666666'
const R_1 = '77777777-7777-4777-8777-777777777777'
const R_2 = '88888888-8888-4888-8888-888888888888'

function tripRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRIP,
    vehicle_id: VEHICLE,
    start_reading_id: START,
    end_reading_id: null,
    cancelled_at: null,
    created_at: '2026-11-27T09:00:00Z',
    ...overrides,
  }
}

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: TRIP,
  vehicleId: VEHICLE,
  startReadingId: START,
  endReadingId: null,
  cancelledAt: null,
  createdAt: new Date('2026-11-27T09:00:00Z'),
  ...overrides,
})

const lastOps = (index: number): Array<[string, unknown[]]> =>
  mocks.calls[index].ops

beforeEach(() => {
  vi.clearAllMocks()
  mocks.calls.length = 0
  mocks.results.length = 0
  mocks.insertReading.mockResolvedValue({ id: R_NEW })
})

describe('tripsRepository.openTrip — ordre qui respecte UNIQUE et D34', () => {
  it('ouverture simple : relevé de départ, puis ligne trips (arrivée null)', async () => {
    mocks.results.push({ data: tripRow({ start_reading_id: R_NEW }) })
    const progress: unknown[] = []
    const result = await tripsRepository.openTrip(
      {
        vehicleId: VEHICLE,
        userId: 'u1',
        start: { km: 50100, readingAt: new Date('2026-11-27T08:00:00Z') },
      },
      (p) => void progress.push(p),
    )
    expect(kilometersRepository.insertReading).toHaveBeenCalledTimes(1)
    expect(kilometersRepository.insertReading).toHaveBeenCalledWith({
      vehicleId: VEHICLE,
      userId: 'u1',
      km: 50100,
      readingAt: new Date('2026-11-27T08:00:00Z'),
      fuelPercent: null,
      notes: null,
    })
    const tripsCall = mocks.calls.find((call) => call.table === 'trips')
    expect(tripsCall?.ops).toContainEqual([
      'insert',
      [
        {
          vehicle_id: VEHICLE,
          start_reading_id: R_NEW,
          end_reading_id: null,
        },
      ],
    ])
    expect(result.id).toBe(TRIP)
    // Progress : départ posé, puis ligne insérée (marqueurs de reprise D39).
    expect(progress).toEqual([
      { startReadingId: R_NEW, endReadingId: null, tripId: null },
      { startReadingId: R_NEW, endReadingId: null, tripId: TRIP },
    ])
  })

  it('rétro-saisie D31 : départ, PUIS arrivée, puis ligne née clôturée', async () => {
    let n = 0
    mocks.insertReading.mockImplementation(async () => ({
      id: [R_1, R_2][n++],
    }))
    mocks.results.push({
      data: tripRow({ start_reading_id: R_1, end_reading_id: R_2 }),
    })
    await tripsRepository.openTrip({
      vehicleId: VEHICLE,
      userId: 'u1',
      start: { km: 50000, readingAt: new Date('2026-11-25T08:00:00Z') },
      end: { km: 50150, readingAt: new Date('2026-11-25T18:00:00Z') },
    })
    expect(mocks.calls.map((call) => call.table)).toEqual(['trips'])
    const insertOp = lastOps(0).find(([op]) => op === 'insert')
    expect(insertOp?.[1][0]).toEqual({
      vehicle_id: VEHICLE,
      start_reading_id: R_1,
      end_reading_id: R_2,
    })
  })

  it('reprise (D39) : un relevé déjà inséré n’est JAMAIS réinséré', async () => {
    mocks.results.push({ data: tripRow() })
    await tripsRepository.openTrip({
      vehicleId: VEHICLE,
      userId: 'u1',
      start: { km: 50100, readingAt: new Date('2026-11-27T08:00:00Z') },
      resume: { startReadingId: START },
    })
    expect(kilometersRepository.insertReading).not.toHaveBeenCalled()
    const insertOp = mocks.calls
      .find((call) => call.table === 'trips')
      ?.ops.find(([op]) => op === 'insert')
    expect(insertOp?.[1][0]).toMatchObject({ start_reading_id: START })
  })
})

describe('tripsRepository.insertTripRow — rejeu et erreurs typées', () => {
  it('rejeu reconnu (UNIQUE start, D39) : la ligne existante est retrouvée', async () => {
    mocks.results.push({
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "trips_start_reading_id_key"',
      },
    })
    mocks.results.push({ data: tripRow() })
    const restored = await tripsRepository.insertTripRow({
      vehicleId: VEHICLE,
      startReadingId: START,
    })
    expect(restored.id).toBe(TRIP)
    // Deux requêtes trips : l'insertion qui sonne, puis la relecture.
    expect(mocks.calls.filter((call) => call.table === 'trips')).toHaveLength(2)
  })

  it('refus du trigger relais : TripError trip_relay_conflict remontée', async () => {
    mocks.results.push({
      error: { code: 'P0001', message: 'TRIP_RELAY_CONFLICT: … (D35).' },
    })
    await expect(
      tripsRepository.insertTripRow({
        vehicleId: VEHICLE,
        startReadingId: START,
      }),
    ).rejects.toThrow(TripError)
  })

  it('clôture : un seul UPDATE end_reading_id (D34 gardé au trigger)', async () => {
    mocks.results.push({ data: tripRow({ end_reading_id: END }) })
    await tripsRepository.closeTrip(TRIP, END)
    const call = mocks.calls[0]
    expect(call.table).toBe('trips')
    expect(call.ops).toContainEqual(['update', [{ end_reading_id: END }]])
    expect(kilometersRepository.insertReading).not.toHaveBeenCalled()
  })

  it('annulation (D36) : UN seul UPDATE trips, le miroir est serveur (notes M9)', async () => {
    mocks.results.push({ data: tripRow() })
    await tripsRepository.cancelTrip(TRIP)
    expect(mocks.calls).toHaveLength(1)
    const [op, args] = lastOps(0).find(([name]) => name === 'update')!
    expect(op).toBe('update')
    expect(args[0]).toMatchObject({ cancelled_at: expect.any(String) })
    expect(mocks.softDeleteReading).not.toHaveBeenCalled()
  })

  it('levée d’annulation : UPDATE trips cancelled_at=null (le trigger restaure)', async () => {
    mocks.results.push({ data: tripRow() })
    await tripsRepository.liftTripCancellation(TRIP)
    expect(mocks.calls[0].ops).toContainEqual([
      'update',
      [{ cancelled_at: null }],
    ])
    expect(mocks.restoreReading).not.toHaveBeenCalled()
  })
})

describe('tripsRepository — suppression et restauration par agrégat (D33/D37)', () => {
  it('deleteTrip : contagion par les deux relevés, AUCUNE écriture sur trips', async () => {
    await tripsRepository.deleteTrip(trip({ endReadingId: END }), 'u1')
    expect(mocks.softDeleteReading).toHaveBeenNthCalledWith(1, START, 'u1')
    expect(mocks.softDeleteReading).toHaveBeenNthCalledWith(2, END, 'u1')
    expect(mocks.calls).toHaveLength(0)
  })

  it('deleteTrip refuse une sortie en cours (elle s’annule, D33)', async () => {
    await expect(
      tripsRepository.deleteTrip(trip(), 'u1'),
    ).rejects.toMatchObject({
      name: 'TripError',
      code: 'trip_immutable',
    })
    expect(mocks.softDeleteReading).not.toHaveBeenCalled()
  })

  it('restoreTrip d’une sortie supprimée : relevés d’abord (départ puis arrivée)', async () => {
    await tripsRepository.restoreTrip(trip({ endReadingId: END }))
    expect(mocks.restoreReading).toHaveBeenNthCalledWith(1, START)
    expect(mocks.restoreReading).toHaveBeenNthCalledWith(2, END)
    expect(mocks.calls).toHaveLength(0)
  })

  it('restoreTrip d’une sortie annulée : un seul UPDATE trips (notes M9)', async () => {
    mocks.results.push({ data: tripRow() })
    await tripsRepository.restoreTrip(
      trip({ cancelledAt: new Date('2026-11-27T10:00:00Z') }),
    )
    expect(mocks.restoreReading).not.toHaveBeenCalled()
    expect(mocks.calls).toHaveLength(1)
  })
})

describe('tripsRepository.fetchTrips', () => {
  it('liste du véhicule, bornée et triée, convertie par le schéma (D26)', async () => {
    mocks.results.push({ data: [tripRow({ end_reading_id: END }), tripRow()] })
    const trips = await tripsRepository.fetchTrips(VEHICLE)
    expect(trips.map((t) => t.id)).toEqual([TRIP, TRIP])
    expect(mocks.calls[0].table).toBe('trips')
    expect(mocks.calls[0].ops).toContainEqual(['eq', ['vehicle_id', VEHICLE]])
    expect(mocks.calls[0].ops).toContainEqual([
      'order',
      ['created_at', { ascending: false }],
    ])
  })

  it('erreur réseau convertie en DataError (D10)', async () => {
    mocks.results.push({ error: { message: 'Failed to fetch' } })
    await expect(tripsRepository.fetchTrips(VEHICLE)).rejects.toMatchObject({
      code: 'network',
    })
  })
})
