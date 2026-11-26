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

import * as store from '@/lib/pendingStore'
import type { NewPendingReading } from '@/lib/pendingStore'
import { DataError } from '@/repositories/errors'
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
