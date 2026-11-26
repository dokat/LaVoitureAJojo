// @vitest-environment jsdom
// Orchestration du hook : ordre insert → upload → attach, erreurs typées qui
// remontent, fraîcheur de la liste. Les repositories sont mockés — les règles
// base ont leurs tests SQL (M2), la pureté D6/canvas a les siens (M4).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  getActiveVehicle: vi.fn(),
  listReadings: vi.fn(),
  insertReading: vi.fn(),
  attachPhoto: vi.fn(),
  softDeleteReading: vi.fn(),
  uploadPhoto: vi.fn(),
  compressPhoto: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'test@example.com' } }),
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
  softDeleteReading: mocks.softDeleteReading,
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
import type { Vehicle } from '@/schemas/vehicles'
import { useReadings } from '@/hooks/useReadings'

const vehicle: Vehicle = {
  id: 'v1',
  brand: 'Clio',
  model: 'III',
  plate: 'XX-123-YY',
  isActive: true,
}

const reading = (overrides: Partial<Reading> = {}): Reading => ({
  id: 'r1',
  vehicleId: 'v1',
  userId: 'u1',
  km: 50000,
  fuelPercent: null,
  photoPath: null,
  notes: null,
  readingAt: new Date('2026-11-20T10:00:00Z'),
  deletedAt: null,
  deletedBy: null,
  restoredAt: null,
  createdAt: new Date('2026-11-20T10:00:05Z'),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getActiveVehicle.mockResolvedValue(vehicle)
  mocks.listReadings.mockResolvedValue([reading()])
})

async function mounted() {
  const view = renderHook(() => useReadings())
  await waitFor(() => expect(view.result.current.status).toBe('ready'))
  return view
}

describe('useReadings — lecture', () => {
  it('charge le véhicule actif puis la chronologie, dernier relevé en tête', async () => {
    const { result } = await mounted()
    expect(result.current.vehicle).toEqual(vehicle)
    expect(result.current.readings).toHaveLength(1)
    expect(result.current.lastReading).toEqual({
      km: 50000,
      readingAt: new Date('2026-11-20T10:00:00Z'),
    })
  })

  it('passe en erreur quand aucun véhicule n\u2019est actif (D3)', async () => {
    mocks.getActiveVehicle.mockResolvedValue(null)
    const { result } = renderHook(() => useReadings())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.code).toBe('not_found')
  })
})

describe('useReadings — addReading', () => {
  it('sans photo : insert seul, liste rechargée', async () => {
    const { result } = await mounted()
    mocks.insertReading.mockResolvedValue(reading({ id: 'r2', km: 50100 }))
    mocks.listReadings.mockResolvedValue([
      reading({ id: 'r2', km: 50100 }),
      reading(),
    ])

    const outcome = await act(async () =>
      result.current.addReading({
        km: 50100,
        readingAt: new Date('2026-11-26T08:00:00Z'),
      }),
    )

    expect(outcome).toMatchObject({ ok: true })
    expect(mocks.compressPhoto).not.toHaveBeenCalled()
    expect(mocks.insertReading).toHaveBeenCalledWith({
      vehicleId: 'v1',
      userId: 'u1',
      km: 50100,
      readingAt: new Date('2026-11-26T08:00:00Z'),
      fuelPercent: null,
      notes: null,
    })
    await waitFor(() => expect(result.current.readings).toHaveLength(2))
  })

  it('avec photo : compression → insert → upload {user}/{reading}.jpg → attach', async () => {
    const { result } = await mounted()
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    mocks.compressPhoto.mockResolvedValue({ blob, width: 1600, height: 1200 })
    mocks.insertReading.mockResolvedValue(reading({ id: 'r2' }))
    mocks.uploadPhoto.mockResolvedValue('u1/r2.jpg')

    const outcome = await act(async () =>
      result.current.addReading({
        km: 50100,
        readingAt: new Date('2026-11-26T08:00:00Z'),
        photo: new Blob(['raw']),
      }),
    )

    expect(mocks.compressPhoto).toHaveBeenCalledTimes(1)
    expect(mocks.uploadPhoto).toHaveBeenCalledWith('u1', 'r2', blob)
    expect(mocks.attachPhoto).toHaveBeenCalledWith('r2', 'u1/r2.jpg')
    expect(outcome).toMatchObject({ ok: true, reading: { id: 'r2' } })
    if (outcome.ok) expect(outcome.reading.photoPath).toBe('u1/r2.jpg')
  })

  it('refus SQL D6 : ok=false avec DataError km_regression, rien n\u2019est uploadé', async () => {
    const { result } = await mounted()
    mocks.insertReading.mockRejectedValue(
      new DataError('km_regression', 'KM_REGRESSION: …'),
    )

    const outcome = await act(async () =>
      result.current.addReading({
        km: 40000,
        readingAt: new Date('2026-11-26T08:00:00Z'),
      }),
    )

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: 'km_regression' },
    })
    expect(mocks.uploadPhoto).not.toHaveBeenCalled()
    expect(result.current.readings).toHaveLength(1)
  })

  it('échec d\u2019upload après insert : relevé conservé, photoError typée', async () => {
    const { result } = await mounted()
    mocks.compressPhoto.mockResolvedValue({
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      width: 1600,
      height: 1200,
    })
    mocks.insertReading.mockResolvedValue(reading({ id: 'r2' }))
    mocks.uploadPhoto.mockRejectedValue(
      new DataError('network', 'Connexion au serveur impossible.'),
    )

    const outcome = await act(async () =>
      result.current.addReading({
        km: 50100,
        readingAt: new Date('2026-11-26T08:00:00Z'),
        photo: new Blob(['raw']),
      }),
    )

    expect(outcome).toMatchObject({ ok: true, photoError: { code: 'network' } })
    expect(mocks.attachPhoto).not.toHaveBeenCalled()
    // le relevé existe en base : la liste est rechargée depuis le serveur.
    await waitFor(() => expect(mocks.listReadings).toHaveBeenCalledTimes(2))
  })

  it('brut photo > 10 Mo : refus avant toute écriture en base', async () => {
    const { result } = await mounted()
    const { ImageError } = await import('@/lib/images')
    mocks.compressPhoto.mockRejectedValue(
      new ImageError('too_large', 'Photo trop volumineuse.'),
    )

    const outcome = await result.current.addReading({
      km: 50100,
      readingAt: new Date('2026-11-26T08:00:00Z'),
      photo: new Blob(['raw']),
    })

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: 'photo_upload' },
    })
    expect(mocks.insertReading).not.toHaveBeenCalled()
  })
})

describe('useReadings — softDelete', () => {
  it('retire de la liste sans écriture physique (D7)', async () => {
    const { result } = await mounted()
    const error = await act(async () => result.current.softDelete('r1'))
    expect(error).toBeNull()
    expect(mocks.softDeleteReading).toHaveBeenCalledWith('r1', 'u1')
    expect(result.current.readings).toHaveLength(0)
    expect(result.current.lastReading).toBeNull()
  })
})
