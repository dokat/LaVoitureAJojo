// @vitest-environment jsdom
// Moteur de synchronisation (D13) : ordre d'envoi, reprise par étapes,
// conflits. Les repositories sont mockés (frontière D23) ; la file est la
// vraie store IndexedDB (fake-indexeddb). Le blob photo n'est jamais touché
// par les mocks → un objet fictif suffit.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  getActiveVehicle: vi.fn(),
  insertReading: vi.fn(),
  uploadPhoto: vi.fn(),
  attachPhoto: vi.fn(),
  openTrip: vi.fn(),
  closeTrip: vi.fn(),
  cancelTrip: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'test@example.com' } }),
}))
vi.mock('@/repositories/vehiclesRepository', () => ({
  getActiveVehicle: mocks.getActiveVehicle,
  listVehicles: vi.fn(),
}))
vi.mock('@/repositories/kilometersRepository', () => ({
  insertReading: mocks.insertReading,
  attachPhoto: mocks.attachPhoto,
  listReadings: vi.fn(),
  getLatestReading: vi.fn(),
  softDeleteReading: vi.fn(),
  restoreReading: vi.fn(),
}))
vi.mock('@/repositories/photosRepository', () => ({
  photoPath: vi.fn(),
  uploadPhoto: mocks.uploadPhoto,
  getSignedUrl: vi.fn(),
}))
// M10 (D39) : le moteur rejoue aussi les intentions sortie, via tripSync.
vi.mock('@/repositories/tripsRepository', () => ({
  fetchTrips: vi.fn(),
  openTrip: mocks.openTrip,
  closeTrip: mocks.closeTrip,
  cancelTrip: mocks.cancelTrip,
  insertTripRow: vi.fn(),
  getTripByStartReading: vi.fn(),
  restoreTrip: vi.fn(),
  deleteTrip: vi.fn(),
  liftTripCancellation: vi.fn(),
  findOpenTrip: vi.fn(),
}))

import * as store from '@/lib/pendingStore'
import type { NewPendingReading } from '@/lib/pendingStore'
import { DataError, toDataError, TripError } from '@/repositories/errors'
import { usePendingQueue } from '@/hooks/usePendingQueue'

const blob = { fake: 'jpeg' } as unknown as Blob

const queuedItem = (overrides: Partial<NewPendingReading> = {}) => ({
  vehicleId: 'v1',
  userId: 'u1',
  km: 50100,
  readingAt: new Date('2026-11-26T08:00:00Z').toISOString(),
  fuelPercent: null,
  notes: null,
  photo: null,
  ...overrides,
})

async function mounted() {
  const view = renderHook(() => usePendingQueue())
  await waitFor(() => expect(view.result.current.items).toBeInstanceOf(Array))
  return view
}

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  setOnline(true)
  await store.clear()
  mocks.getActiveVehicle.mockResolvedValue({ id: 'v1' })
  mocks.insertReading.mockResolvedValue({ id: 'r-new' })
  mocks.uploadPhoto.mockResolvedValue('u1/r-new.jpg')
  mocks.attachPhoto.mockResolvedValue(undefined)
  // openTrip d'imitation : il RAPPORTE ses étapes (contrat du repo) puis
  // rend une ligne — c'est ce qui alimente les marqueurs de reprise (D39).
  mocks.openTrip.mockImplementation(
    async (
      input: {
        vehicleId: string
        end?: unknown
        resume?: {
          startReadingId?: string | null
          endReadingId?: string | null
        }
      },
      onProgress?: (p: unknown) => Promise<void> | void,
    ) => {
      const startReadingId = input.resume?.startReadingId ?? 'r-start'
      const endReadingId =
        input.resume?.endReadingId ?? (input.end ? 'r-end' : null)
      await onProgress?.({ startReadingId, endReadingId, tripId: null })
      await onProgress?.({ startReadingId, endReadingId, tripId: 't1' })
      return {
        id: 't1',
        vehicleId: input.vehicleId,
        startReadingId,
        endReadingId,
        cancelledAt: null,
        createdAt: new Date('2026-11-27T09:00:00Z'),
      }
    },
  )
  mocks.closeTrip.mockResolvedValue({ id: 't1' })
  mocks.cancelTrip.mockResolvedValue({ id: 't9' })
})

describe('usePendingQueue — renvoi d’un item en file', () => {
  it('succès : insert → upload → attach → sortie de file (D25 dans l’ordre inverse)', async () => {
    const { result } = await mounted()
    await act(async () => {
      await store.add(queuedItem({ photo: blob }))
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mocks.insertReading).toHaveBeenCalledWith({
      vehicleId: 'v1',
      userId: 'u1',
      km: 50100,
      readingAt: new Date('2026-11-26T08:00:00Z'),
      fuelPercent: null,
      notes: null,
    })
    expect(mocks.uploadPhoto).toHaveBeenCalledWith('u1', 'r-new', blob)
    expect(mocks.attachPhoto).toHaveBeenCalledWith('r-new', 'u1/r-new.jpg')
  })

  it('véhicule inconnu à la saisie (montage hors-ligne) : résolu au renvoi', async () => {
    const { result } = await mounted()
    await act(async () => {
      await store.add(queuedItem({ vehicleId: null }))
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mocks.insertReading).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: 'v1' }),
    )
  })

  it('ordre chronologique d’entrée dans la file respecté au renvoi', async () => {
    const order: number[] = []
    mocks.insertReading.mockImplementation(async ({ km }: { km: number }) => {
      order.push(km)
      return { id: `r-${km}` }
    })
    const { result } = await mounted()
    await act(async () => {
      await store.add(queuedItem({ km: 50100 }))
      await store.add(queuedItem({ km: 50200 }))
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(order).toEqual([50100, 50200])
  })
})

describe('usePendingQueue — échecs (D13)', () => {
  it('réseau retombé : l’item reste « pending », jamais perdu', async () => {
    mocks.insertReading.mockRejectedValue(
      new DataError('network', 'Connexion au serveur impossible.'),
    )
    const { result } = await mounted()
    await act(async () => {
      await store.add(queuedItem())
    })
    await waitFor(() => expect(result.current.count).toBe(1))
    expect(result.current.items[0]).toMatchObject({
      status: 'pending',
      insertedReadingId: null,
    })
  })

  it('conflit D6 côté base : badge conflit + message, pas d’upload', async () => {
    mocks.insertReading.mockRejectedValue(
      new DataError('km_regression', 'KM_REGRESSION: …'),
    )
    const { result } = await mounted()
    await act(async () => {
      await store.add(queuedItem({ photo: blob }))
    })
    await waitFor(() => expect(result.current.conflicts).toBe(1))
    expect(result.current.items[0].status).toBe('conflict')
    expect(result.current.items[0].lastError).toBeTruthy()
    expect(mocks.uploadPhoto).not.toHaveBeenCalled()
  })

  it('insert passé, upload en réseau : reprise SANS double insertion', async () => {
    mocks.uploadPhoto
      .mockRejectedValueOnce(new DataError('network', 'réseau'))
      .mockResolvedValue('u1/r-new.jpg')
    const { result } = await mounted()
    await act(async () => {
      await store.add(queuedItem({ photo: blob }))
    })
    await waitFor(() => expect(result.current.count).toBe(1))
    expect(result.current.items[0].insertedReadingId).toBe('r-new')
    // Retour du réseau : seule la photo repart.
    await act(async () => {
      await result.current.syncNow()
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mocks.insertReading).toHaveBeenCalledTimes(1)
    expect(mocks.uploadPhoto).toHaveBeenCalledTimes(2)
    expect(mocks.attachPhoto).toHaveBeenCalledWith('r-new', 'u1/r-new.jpg')
  })

  it('aucun envoi pendant que le navigateur est hors-ligne', async () => {
    setOnline(false)
    const { result } = await mounted()
    await act(async () => {
      await store.add(queuedItem())
    })
    await act(async () => {
      await result.current.syncNow()
    })
    expect(mocks.insertReading).not.toHaveBeenCalled()
    expect(result.current.count).toBe(1)
  })
})

describe('usePendingQueue — actions utilisateur', () => {
  it('édition d’un conflit : re-synchro immédiate et sortie de file', async () => {
    mocks.insertReading.mockRejectedValueOnce(
      new DataError('km_regression', 'KM_REGRESSION: …'),
    )
    const { result } = await mounted()
    await act(async () => {
      await store.add(queuedItem({ km: 40000 }))
    })
    await waitFor(() => expect(result.current.conflicts).toBe(1))
    const item = result.current.items[0]

    await act(async () => {
      await result.current.editItem(item.id, { km: 60000 })
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mocks.insertReading).toHaveBeenLastCalledWith(
      expect.objectContaining({ km: 60000 }),
    )
  })

  it('abandon : retrait local confirmé (D13 — la seule sortie hors synchro)', async () => {
    mocks.insertReading.mockRejectedValue(
      new DataError('km_regression', 'KM_REGRESSION: …'),
    )
    const { result } = await mounted()
    await act(async () => {
      await store.add(queuedItem())
    })
    await waitFor(() => expect(result.current.conflicts).toBe(1))

    await act(async () => {
      await result.current.discardItem(result.current.items[0].id)
    })
    expect(result.current.items).toHaveLength(0)
    expect(await store.load()).toHaveLength(0)
  })
})

// ── Milestone 10 : intentions sortie (D39) ──────────────────────────────────

const tripItem = (overrides: Partial<NewPendingReading>) =>
  queuedItem(overrides)

describe('usePendingQueue — intention tripOpen (D39)', () => {
  it('relais sans branche dédiée : lecture puis ligne trips, item vidé', async () => {
    // Qu'une sortie soit déjà ouverte ou non ne change RIEN côté client :
    // le relais est une insertion qui réussit (D35/D39), le trigger closant
    // l'ancienne sortie avec le MÊME relevé (preuve base : trips_test.sql).
    const { result } = await mounted()
    await act(async () => {
      await store.add(tripItem({ intent: 'tripOpen' }))
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mocks.openTrip).toHaveBeenCalledTimes(1)
    expect(mocks.openTrip.mock.calls[0][0]).toMatchObject({
      vehicleId: 'v1',
      userId: 'u1',
      start: { km: 50100, fuelPercent: null, notes: null },
      end: null,
    })
    expect(result.current.conflicts).toBe(0)
    // Le moteur de la file ne réinvente pas l'insertion du relevé : c'est
    // openTrip (repository) qui pilote ses propres étapes.
    expect(mocks.insertReading).not.toHaveBeenCalled()
  })

  it('ouverture rétroactive : l’arrivée voyage dans l’item (D31)', async () => {
    const { result } = await mounted()
    await act(async () => {
      await store.add(
        tripItem({
          intent: 'tripOpen',
          endKm: 50200,
          endReadingAt: new Date('2026-11-26T18:00:00Z').toISOString(),
          endNotes: 'retour',
        }),
      )
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mocks.openTrip.mock.calls[0][0]).toMatchObject({
      start: { km: 50100 },
      end: { km: 50200, notes: 'retour' },
    })
  })

  it('coupure en plein vol : le renvoi reprend aux marqueurs, jamais de doublon', async () => {
    mocks.openTrip
      .mockImplementationOnce(
        async (
          _input: unknown,
          onProgress?: (p: unknown) => Promise<void> | void,
        ) => {
          await onProgress?.({
            startReadingId: 'r-partial',
            endReadingId: null,
            tripId: null,
          })
          throw new DataError('network', 'connexion coupée')
        },
      )
      .mockImplementation(async (input, onProgress) => {
        const startReadingId = input.resume?.startReadingId ?? 'r-partial'
        await onProgress?.({ startReadingId, endReadingId: null, tripId: 't1' })
        return { id: 't1' }
      })
    const { result } = await mounted()
    await act(async () => {
      await store.add(tripItem({ intent: 'tripOpen' }))
    })
    await waitFor(() => expect(result.current.count).toBe(1))
    expect(result.current.items[0]).toMatchObject({
      status: 'pending',
      insertedReadingId: 'r-partial',
      tripId: null,
    })

    await act(async () => {
      await result.current.syncNow()
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    // Reprise : le second appel porte le marqueur — le relevé n'est jamais
    // réinséré (D29 étendu).
    expect(mocks.openTrip).toHaveBeenCalledTimes(2)
    expect(mocks.openTrip.mock.calls[1][0]).toMatchObject({
      resume: { startReadingId: 'r-partial', endReadingId: null },
    })
  })

  it('photo du départ : upload sur l’id rapporté par openTrip, puis attach', async () => {
    const { result } = await mounted()
    await act(async () => {
      await store.add(tripItem({ intent: 'tripOpen', photo: blob }))
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mocks.uploadPhoto).toHaveBeenCalledWith('u1', 'r-start', blob)
    expect(mocks.attachPhoto).toHaveBeenCalledWith('r-start', 'u1/r-new.jpg')
  })

  it('refus déterministe (relais D35) : badge conflit, item conservé', async () => {
    mocks.openTrip.mockRejectedValue(
      toDataError({
        code: 'P0001',
        message:
          "TRIP_RELAY_CONFLICT: le relais échoue — vérifiez le compteur, ou demandez à l'admin (D35).",
      }),
    )
    const { result } = await mounted()
    await act(async () => {
      await store.add(tripItem({ intent: 'tripOpen' }))
    })
    await waitFor(() => expect(result.current.conflicts).toBe(1))
    expect(result.current.items[0].lastError).toMatch(/D35|compteur|admin/i)
  })
})

describe('usePendingQueue — intentions tripClose et tripCancel (D39)', () => {
  it('tripClose : arrivée insérée (D6 au renvoi) puis clôture de la sortie', async () => {
    const { result } = await mounted()
    await act(async () => {
      await store.add(
        tripItem({ intent: 'tripClose', tripId: 't1', km: 50200 }),
      )
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mocks.insertReading).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: 'v1', km: 50200 }),
    )
    expect(mocks.closeTrip).toHaveBeenCalledWith('t1', 'r-new')
  })

  it('tripClose en reprise : relevé déjà passé → seul le close repart', async () => {
    mocks.closeTrip.mockRejectedValueOnce(
      new DataError('network', 'Connexion au serveur impossible.'),
    )
    const { result } = await mounted()
    await act(async () => {
      await store.add(
        tripItem({ intent: 'tripClose', tripId: 't1', km: 50200 }),
      )
    })
    await waitFor(() => expect(result.current.count).toBe(1))
    expect(result.current.items[0]).toMatchObject({
      status: 'pending',
      insertedReadingId: 'r-new',
    })

    await act(async () => {
      await result.current.syncNow()
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    // Le relevé d'arrivée n'est qu'inséré UNE fois ; le close est un UPDATE
    // idempotent (rejeu à l'identique = no-op trigger, notes M9).
    expect(mocks.insertReading).toHaveBeenCalledTimes(1)
    expect(mocks.closeTrip).toHaveBeenCalledTimes(2)
  })

  it('tripClose refusé par D34 : conflit typé, rien n’est perdu', async () => {
    mocks.closeTrip.mockRejectedValue(
      new TripError('trip_km_order', 'TRIP_KM_ORDER: …'),
    )
    const { result } = await mounted()
    await act(async () => {
      await store.add(
        tripItem({ intent: 'tripClose', tripId: 't1', km: 49000 }),
      )
    })
    await waitFor(() => expect(result.current.conflicts).toBe(1))
    expect(result.current.items[0].status).toBe('conflict')
  })

  it('tripCancel : un seul UPDATE idempotent, aucun relevé impliqué', async () => {
    const { result } = await mounted()
    await act(async () => {
      await store.add(
        tripItem({
          intent: 'tripCancel',
          tripId: 't9',
          km: 0,
          readingAt: new Date('2026-11-27T08:00:00Z').toISOString(),
        }),
      )
    })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(mocks.cancelTrip).toHaveBeenCalledWith('t9')
    expect(mocks.insertReading).not.toHaveBeenCalled()
    expect(mocks.openTrip).not.toHaveBeenCalled()
  })

  it('item tripClose sans sortie cible : conflit explicte, pas de crash', async () => {
    const { result } = await mounted()
    await act(async () => {
      await store.add(tripItem({ intent: 'tripClose', tripId: null }))
    })
    await waitFor(() => expect(result.current.conflicts).toBe(1))
    expect(mocks.closeTrip).not.toHaveBeenCalled()
  })
})
