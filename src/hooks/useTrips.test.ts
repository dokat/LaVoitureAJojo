// @vitest-environment jsdom
// Orchestration sortie côté hook (M10) : enrichissement par jonction d'id,
// validations D6/D34/relais AVANT envoi, étapes d'openTrip, mise en file des
// intentions (D39) avec marqueurs de reprise. Les repositories sont mockés à
// leur frontière (D23) ; les gardes base (relais, clôture, annulation) ont
// leurs preuves SQL (M9, 53/53).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  getActiveVehicle: vi.fn(),
  listReadings: vi.fn(),
  insertReading: vi.fn(),
  attachPhoto: vi.fn(),
  fetchTrips: vi.fn(),
  openTrip: vi.fn(),
  closeTrip: vi.fn(),
  cancelTrip: vi.fn(),
  deleteTrip: vi.fn(),
  restoreTrip: vi.fn(),
  uploadPhoto: vi.fn(),
  compressPhoto: vi.fn(),
  pendingAdd: vi.fn(),
  pendingUpdate: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'test@example.com' } }),
}))
vi.mock('@/lib/pendingStore', () => ({
  add: mocks.pendingAdd,
  update: mocks.pendingUpdate,
}))
vi.mock('@/repositories/vehiclesRepository', () => ({
  getActiveVehicle: mocks.getActiveVehicle,
  listVehicles: vi.fn(),
}))
vi.mock('@/repositories/kilometersRepository', () => ({
  listReadings: mocks.listReadings,
  getLatestReading: vi.fn(),
  insertReading: mocks.insertReading,
  attachPhoto: mocks.attachPhoto,
  softDeleteReading: vi.fn(),
  restoreReading: vi.fn(),
}))
vi.mock('@/repositories/tripsRepository', () => ({
  fetchTrips: mocks.fetchTrips,
  openTrip: mocks.openTrip,
  closeTrip: mocks.closeTrip,
  cancelTrip: mocks.cancelTrip,
  deleteTrip: mocks.deleteTrip,
  restoreTrip: mocks.restoreTrip,
  insertTripRow: vi.fn(),
  getTripByStartReading: vi.fn(),
  liftTripCancellation: vi.fn(),
  findOpenTrip: vi.fn(),
}))
vi.mock('@/repositories/photosRepository', () => ({
  photoPath: vi.fn(),
  uploadPhoto: mocks.uploadPhoto,
  getSignedUrl: vi.fn(),
}))
vi.mock('@/lib/images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/images')>()),
  compressPhoto: mocks.compressPhoto,
}))

import { DataError } from '@/repositories/errors'
import type { Reading } from '@/schemas/kilometers'
import type { Trip } from '@/schemas/trips'
import { useTrips, isLiveTrip, validateTripOrder } from '@/hooks/useTrips'
import type { TripEntry } from '@/hooks/useTrips'

const VEHICLE_ID = '11111111-1111-4111-8111-111111111111'

const reading = (overrides: Partial<Reading> = {}): Reading => ({
  id: 'r1',
  vehicleId: VEHICLE_ID,
  userId: 'u1',
  km: 50000,
  fuelPercent: null,
  photoPath: null,
  notes: null,
  readingAt: new Date('2026-11-25T08:00:00Z'),
  deletedAt: null,
  deletedBy: null,
  restoredAt: null,
  createdAt: new Date('2026-11-25T08:00:05Z'),
  ...overrides,
})

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  vehicleId: VEHICLE_ID,
  startReadingId: 'r-start',
  endReadingId: null,
  cancelledAt: null,
  createdAt: new Date('2026-11-26T08:00:00Z'),
  ...overrides,
})

/** TripEntry de main (pour les tests purs d'isLiveTrip, sans hook). */
function tripEntry(
  opts: {
    trip?: Partial<Trip>
    start?: Reading | null
    end?: Reading | null
  } = {},
): TripEntry {
  const t = trip(opts.trip)
  const startReading =
    opts.start === undefined ? reading({ id: 'r-start' }) : opts.start
  const endReading =
    opts.end === undefined
      ? t.endReadingId
        ? reading({ id: t.endReadingId, km: 50300 })
        : null
      : opts.end
  return {
    trip: t,
    startReading,
    endReading,
    distanceKm:
      startReading && endReading ? endReading.km - startReading.km : null,
    isOpen: t.endReadingId === null && t.cancelledAt === null,
  }
}

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

async function mounted() {
  const view = renderHook(() => useTrips(VEHICLE_ID))
  await waitFor(() => expect(view.result.current.status).toBe('ready'))
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  setOnline(true)
  mocks.getActiveVehicle.mockResolvedValue({ id: VEHICLE_ID })
  // Chronologie de base : sortie t1 ouverte hier (départ r-start), et un
  // relevé plus récent aujourd'hui (r-latest) — appui des validations D6.
  mocks.fetchTrips.mockResolvedValue([trip()])
  mocks.listReadings.mockResolvedValue([
    reading({
      id: 'r-latest',
      km: 60000,
      readingAt: new Date('2026-11-26T12:00:00Z'),
    }),
    reading({
      id: 'r-start',
      km: 50000,
      readingAt: new Date('2026-11-25T08:00:00Z'),
    }),
  ])
  mocks.pendingAdd.mockResolvedValue({ id: 'p1' })
  mocks.pendingUpdate.mockResolvedValue(undefined)
  // openTrip d'imitation : rapporte ses étapes comme le vrai (marqueurs D39).
  mocks.openTrip.mockImplementation(async (_input, onProgress) => {
    await onProgress?.({
      startReadingId: 'r-new',
      endReadingId: null,
      tripId: 't-new',
    })
    return trip({ id: 't-new', startReadingId: 'r-new' })
  })
})

afterEach(() => {
  setOnline(true)
})

describe('useTrips — lecture et enrichissement (D38)', () => {
  it('joint les sorties aux relevés par id, dérive distance et sortie en cours', async () => {
    const { result } = await mounted()
    expect(mocks.fetchTrips).toHaveBeenCalledWith(VEHICLE_ID)
    const entry = result.current.entries[0]
    expect(entry.startReading?.id).toBe('r-start')
    expect(entry.distanceKm).toBeNull() // en cours : pas d'arrivée
    expect(entry.isOpen).toBe(true)
    expect(result.current.openTrip?.trip.id).toBe('t1')
  })

  it('distance = km arrivée − km départ (D38)', async () => {
    mocks.fetchTrips.mockResolvedValue([trip({ endReadingId: 'r-end' })])
    mocks.listReadings.mockResolvedValue([
      reading({
        id: 'r-end',
        km: 50300,
        readingAt: new Date('2026-11-25T18:00:00Z'),
      }),
      reading({ id: 'r-start', km: 50000 }),
    ])
    const { result } = await mounted()
    expect(result.current.entries[0].distanceKm).toBe(300)
    expect(result.current.openTrip).toBeNull()
  })

  it('relais : le même relevé relie deux sorties (D30/D35, lecture cliente)', async () => {
    // Preuve base : trips_test.sql. Côté client, la jonction par id doit
    // partager l'objet relevé — arrivée de l'une ET départ de l'autre.
    mocks.fetchTrips.mockResolvedValue([
      trip({
        id: 't-b',
        startReadingId: 'r-shared',
        createdAt: new Date('2026-11-26T09:00:00Z'),
      }),
      trip({ id: 't-a', startReadingId: 'r-start', endReadingId: 'r-shared' }),
    ])
    mocks.listReadings.mockResolvedValue([
      reading({
        id: 'r-shared',
        km: 50100,
        readingAt: new Date('2026-11-26T08:00:00Z'),
      }),
      reading({ id: 'r-start', km: 50000 }),
    ])
    const { result } = await mounted()
    const [entryB, entryA] = result.current.entries
    expect(entryA.endReading?.id).toBe('r-shared')
    expect(entryB.startReading?.id).toBe('r-shared')
    expect(entryA.endReading).toBe(entryB.startReading) // même objet, joint par id
    expect(entryA.distanceKm).toBe(100)
  })

  it('relit les morts aussi : une sortie soft-deleted reste affichable (D37)', async () => {
    await mounted()
    expect(mocks.listReadings).toHaveBeenCalledWith(VEHICLE_ID, {
      includeDeleted: true,
    })
  })
})

describe('useTrips.startTrip — validations avant envoi', () => {
  it('ouverture simple : openTrip reçoit départ, pas d’arrivée, pas de reprise', async () => {
    const { result } = await mounted()
    const outcome = await result.current.startTrip({
      start: { km: 60100, readingAt: new Date('2026-11-26T14:00:00Z') },
    })
    expect(outcome).toMatchObject({ ok: true, tripId: 't-new' })
    expect(mocks.openTrip.mock.calls[0][0]).toMatchObject({
      vehicleId: VEHICLE_ID,
      userId: 'u1',
      start: { km: 60100, fuelPercent: null, notes: null },
      end: null,
      resume: { startReadingId: null, endReadingId: null },
    })
    // Relecture après succès (patron M4-M7).
    await waitFor(() => expect(mocks.fetchTrips).toHaveBeenCalledTimes(2))
  })

  it('rétro-saisie (D31) : départ ET arrivée partent dans le même openTrip', async () => {
    const { result } = await mounted()
    const outcome = await result.current.startTrip({
      start: {
        km: 60000,
        readingAt: new Date('2026-11-26T09:00:00Z'),
        notes: 'aller',
      },
      end: {
        km: 60050,
        readingAt: new Date('2026-11-26T10:00:00Z'),
        notes: 'retour',
      },
    })
    expect(outcome).toMatchObject({ ok: true })
    expect(mocks.openTrip.mock.calls[0][0]).toMatchObject({
      start: { km: 60000, notes: 'aller' },
      end: { km: 60050, notes: 'retour' },
    })
  })

  it('recul D6 au départ : refus client, AUCUNE écriture (la base est vérité)', async () => {
    const { result } = await mounted()
    const outcome = await result.current.startTrip({
      start: { km: 59000, readingAt: new Date('2026-11-26T13:00:00Z') },
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: { code: 'km_regression' },
    })
    expect(mocks.openTrip).not.toHaveBeenCalled()
  })

  it('D34 violée à l’arrivée d’une rétro-saisie : TripError, rien n’est écrit', async () => {
    const { result } = await mounted()
    // Départ OK (rétro par rapport à r-latest), arrivée sous le départ :
    // D6 laisse passer (date avant le dernier relevé), c'est D34 qui tranche.
    const outcome = await result.current.startTrip({
      start: { km: 59900, readingAt: new Date('2026-11-26T09:00:00Z') },
      end: { km: 59800, readingAt: new Date('2026-11-26T09:30:00Z') },
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: { name: 'TripError', code: 'trip_km_order' },
    })
    expect(mocks.openTrip).not.toHaveBeenCalled()
  })

  it('relais du D35 côté client : km sous le départ oublié = refus typé avant envoi', async () => {
    const { result } = await mounted()
    // r-latest (60 000 aujourd'hui) rend la candidate légale pour D6 (date
    // ancienne) ; c'est le départ OUBLIÉ de t1 (50 000) que le relais violerait.
    const outcome = await result.current.startTrip({
      start: { km: 49000, readingAt: new Date('2026-11-24T08:00:00Z') },
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: { code: 'trip_relay_conflict' },
    })
    expect(mocks.openTrip).not.toHaveBeenCalled()
  })

  it('photo du départ : compressée puis uploadée sur l’id rapporté par openTrip (D32)', async () => {
    const { result } = await mounted()
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' })
    mocks.compressPhoto.mockResolvedValue({
      blob: jpeg,
      width: 1600,
      height: 1200,
    })
    mocks.uploadPhoto.mockResolvedValue('u1/r-new.jpg')
    const outcome = await result.current.startTrip({
      start: {
        km: 60100,
        readingAt: new Date('2026-11-26T14:00:00Z'),
        photo: new Blob(['raw']),
      },
    })
    expect(outcome).toMatchObject({ ok: true })
    expect(mocks.compressPhoto).toHaveBeenCalledTimes(1)
    expect(mocks.uploadPhoto).toHaveBeenCalledWith('u1', 'r-new', jpeg)
    expect(mocks.attachPhoto).toHaveBeenCalledWith('r-new', 'u1/r-new.jpg')
  })

  it('échec déterministe APRÈS sortie en base : photoError, la sortie reste (esprit D25)', async () => {
    const { result } = await mounted()
    mocks.compressPhoto.mockResolvedValue({
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      width: 1600,
      height: 1200,
    })
    mocks.uploadPhoto.mockRejectedValue(
      new DataError('photo_upload', 'Bucket refusé.'),
    )
    const outcome = await result.current.startTrip({
      start: {
        km: 60100,
        readingAt: new Date('2026-11-26T14:00:00Z'),
        photo: new Blob(['raw']),
      },
    })
    expect(outcome).toMatchObject({
      ok: true,
      tripId: 't-new',
      photoError: { code: 'photo_upload' },
    })
    expect(mocks.pendingAdd).not.toHaveBeenCalled()
  })
})

describe('useTrips.startTrip — hors-ligne (D39)', () => {
  it('ouverture hors-ligne : item tripOpen en file, aucune écriture réseau', async () => {
    const { result } = await mounted()
    setOnline(false)
    const outcome = await result.current.startTrip({
      start: { km: 60100, readingAt: new Date('2026-11-26T14:00:00Z') },
      end: { km: 60200, readingAt: new Date('2026-11-26T18:00:00Z') },
    })
    expect(outcome).toEqual({ ok: true, queued: true })
    expect(mocks.openTrip).not.toHaveBeenCalled()
    expect(mocks.pendingAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'tripOpen',
        vehicleId: VEHICLE_ID,
        userId: 'u1',
        km: 60100,
        endKm: 60200,
      }),
    )
    // Marqueurs de reprise initiaux : rien n'est encore passé.
    expect(mocks.pendingUpdate).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        insertedReadingId: null,
        insertedEndReadingId: null,
        tripId: null,
      }),
    )
  })

  it('réseau lâché EN PLEIN VOL : l’item file avec les étapes déjà passées', async () => {
    mocks.openTrip.mockImplementation(async (_input, onProgress) => {
      await onProgress?.({
        startReadingId: 'r-gone',
        endReadingId: null,
        tripId: null,
      })
      throw new DataError('network', 'Connexion au serveur impossible.')
    })
    const { result } = await mounted()
    const outcome = await result.current.startTrip({
      start: { km: 60100, readingAt: new Date('2026-11-26T14:00:00Z') },
    })
    expect(outcome).toEqual({ ok: true, queued: true })
    // Le relevé déjà inséré est marqué : le renvoi ne le réinsérera pas (D29).
    expect(mocks.pendingUpdate).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ insertedReadingId: 'r-gone' }),
    )
  })

  it('montage hors-ligne, véhicule inconnu : l’ouverture file quand même — le véhicule se résout au renvoi (patron M7)', async () => {
    setOnline(false)
    const view = renderHook(() => useTrips(null))
    const outcome = await view.result.current.startTrip({
      start: { km: 60100, readingAt: new Date('2026-11-26T14:00:00Z') },
    })
    expect(outcome).toEqual({ ok: true, queued: true })
    expect(mocks.openTrip).not.toHaveBeenCalled()
    expect(mocks.pendingAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'tripOpen',
        vehicleId: null,
        km: 60100,
      }),
    )
  })

  it('en ligne sans véhicule résolu : refus déterministe, rien en file', async () => {
    const view = renderHook(() => useTrips(null))
    const outcome = await view.result.current.startTrip({
      start: { km: 60100, readingAt: new Date('2026-11-26T14:00:00Z') },
    })
    expect(outcome).toMatchObject({ ok: false, error: { code: 'not_found' } })
    expect(mocks.pendingAdd).not.toHaveBeenCalled()
  })
})

describe('useTrips.completeTrip (D34/D39)', () => {
  it('en ligne : arrivée insérée (D6) puis clôture de la sortie (D34 au trigger)', async () => {
    const { result } = await mounted()
    mocks.insertReading.mockResolvedValue({ id: 'r-end' } as Reading)
    mocks.closeTrip.mockResolvedValue(trip({ endReadingId: 'r-end' }))
    const outcome = await result.current.completeTrip('t1', {
      km: 60200,
      readingAt: new Date('2026-11-26T18:00:00Z'),
    })
    expect(outcome).toMatchObject({ ok: true })
    expect(mocks.insertReading).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: VEHICLE_ID, km: 60200 }),
    )
    expect(mocks.closeTrip).toHaveBeenCalledWith('t1', 'r-end')
  })

  it('hors-ligne : item tripClose — les champs de base portent l’arrivée', async () => {
    const { result } = await mounted()
    setOnline(false)
    const outcome = await result.current.completeTrip('t1', {
      km: 60200,
      readingAt: new Date('2026-11-26T18:00:00Z'),
      notes: 'retour au bercail',
    })
    expect(outcome).toEqual({ ok: true, queued: true })
    expect(mocks.closeTrip).not.toHaveBeenCalled()
    expect(mocks.pendingAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'tripClose',
        tripId: 't1',
        km: 60200,
        notes: 'retour au bercail',
      }),
    )
  })

  it('arrivée en recul D6 : refus avant toute écriture', async () => {
    const { result } = await mounted()
    const outcome = await result.current.completeTrip('t1', {
      km: 59000,
      readingAt: new Date('2026-11-26T13:00:00Z'),
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: { code: 'km_regression' },
    })
    expect(mocks.insertReading).not.toHaveBeenCalled()
  })
})

describe('useTrips — annuler, supprimer, restaurer (D33/D36/D37)', () => {
  it('annulation en ligne : un seul UPDATE trips (le trigger soft-delete le départ)', async () => {
    const { result } = await mounted()
    mocks.cancelTrip.mockResolvedValue(
      trip({ cancelledAt: new Date('2026-11-26T15:00:00Z') }),
    )
    const error = await result.current.cancelTrip('t1')
    expect(error).toBeNull()
    expect(mocks.cancelTrip).toHaveBeenCalledTimes(1)
    // Côté client, c'est bien UNE écriture — la seconde a lieu en base,
    // dans le trigger miroir (cohérence D36 prouvée par trips_test.sql).
    expect(mocks.fetchTrips).toHaveBeenCalledTimes(2) // relecture après succès
  })

  it('annulation hors-ligne : item tripCancel, aucune écriture réseau', async () => {
    const { result } = await mounted()
    setOnline(false)
    const error = await result.current.cancelTrip('t1')
    expect(error).toBeNull()
    expect(mocks.cancelTrip).not.toHaveBeenCalled()
    expect(mocks.pendingAdd).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'tripCancel', tripId: 't1' }),
    )
  })

  it('suppression : contagion par les relevés, trips jamais écrit (D33)', async () => {
    const { result } = await mounted()
    mocks.deleteTrip.mockResolvedValue(undefined)
    const error = await result.current.deleteTrip('t1')
    expect(error).toBeNull()
    expect(mocks.deleteTrip).toHaveBeenCalledWith(trip(), 'u1')
  })

  it('restauration par agrégat : c’est le repository qui branche (D37)', async () => {
    const { result } = await mounted()
    mocks.restoreTrip.mockResolvedValue(trip())
    const error = await result.current.restoreTrip('t1')
    expect(error).toBeNull()
    expect(mocks.restoreTrip).toHaveBeenCalledWith(trip())
  })

  it('restauration refusée par D18 : erreur remontée, liste relue (pas d’optimisme)', async () => {
    const { result } = await mounted()
    mocks.restoreTrip.mockRejectedValue(
      new DataError('km_regression', 'KM_REGRESSION: …'),
    )
    const error = await result.current.restoreTrip('t1')
    expect(error).toMatchObject({ code: 'km_regression' })
    await waitFor(() => expect(mocks.fetchTrips).toHaveBeenCalledTimes(2))
  })

  it('sortie inconnue : not_found, aucune écriture', async () => {
    const { result } = await mounted()
    const error = await result.current.deleteTrip('t-absente')
    expect(error).toMatchObject({ code: 'not_found' })
    expect(mocks.deleteTrip).not.toHaveBeenCalled()
  })
})

describe('validateTripOrder — règle interne D34 pure', () => {
  const start = { km: 50000, readingAt: new Date('2026-11-25T08:00:00Z') }

  it('égalité acceptée (sortie sans rouler, D34)', () => {
    expect(
      validateTripOrder(start, {
        km: 50000,
        readingAt: new Date('2026-11-25T08:00:00Z'),
      }),
    ).toEqual({ ok: true })
  })

  it('km en retrait : trip_km_order, message explicite', () => {
    const verdict = validateTripOrder(start, {
      km: 49999,
      readingAt: new Date('2026-11-25T09:00:00Z'),
    })
    expect(verdict).toMatchObject({ ok: false, code: 'trip_km_order' })
  })

  it('date en retrait : trip_date_order', () => {
    const verdict = validateTripOrder(start, {
      km: 50100,
      readingAt: new Date('2026-11-25T07:00:00Z'),
    })
    expect(verdict).toMatchObject({ ok: false, code: 'trip_date_order' })
  })

  it('contexte relais : même refus, code trip_relay_conflict (D35)', () => {
    const verdict = validateTripOrder(
      start,
      { km: 49990, readingAt: new Date('2026-11-25T09:00:00Z') },
      { relay: true },
    )
    expect(verdict).toMatchObject({ ok: false, code: 'trip_relay_conflict' })
    if (!verdict.ok) expect(verdict.message).toMatch(/sortie en cours/)
  })
})

describe('isLiveTrip — verdict « vivante » partagé des vues (D33/D36)', () => {
  it('sortie clôturée aux deux relevés sains : vivante', () => {
    expect(isLiveTrip(tripEntry({ trip: { endReadingId: 'r-end' } }))).toBe(
      true,
    )
  })

  it('sortie en cours : vivante (son exclusion du condensé relève d’isOpen, D42)', () => {
    expect(isLiveTrip(tripEntry())).toBe(true)
  })

  it('annulée (D36) : morte', () => {
    expect(
      isLiveTrip(
        tripEntry({ trip: { cancelledAt: new Date('2026-11-26T15:00:00Z') } }),
      ),
    ).toBe(false)
  })

  it('départ soft-deleted par contagion (D33) : morte', () => {
    expect(
      isLiveTrip(
        tripEntry({
          trip: { endReadingId: 'r-end' },
          start: reading({ id: 'r-start', deletedAt: new Date() }),
        }),
      ),
    ).toBe(false)
  })

  it('arrivée soft-deleted alors que le départ vit : morte (D37, restauration par agrégat)', () => {
    expect(
      isLiveTrip(
        tripEntry({
          trip: { endReadingId: 'r-end' },
          end: reading({ id: 'r-end', km: 50300, deletedAt: new Date() }),
        }),
      ),
    ).toBe(false)
  })

  it('relevé de départ introuvable : morte', () => {
    expect(isLiveTrip(tripEntry({ start: null }))).toBe(false)
  })
})
