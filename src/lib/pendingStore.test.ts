// La file IndexedDB, testée sur l'implémentation fake de l'API (D23 :
// local-only). Le blob photo passe par le structured clone — d'où
// l'environnement node (le Blob de jsdom n'est pas celui que clone
// structuredClone). @vitest-environment node (défaut de la config).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import * as store from '@/lib/pendingStore'
import type { NewPendingReading } from '@/lib/pendingStore'

const base = (
  overrides: Partial<NewPendingReading> = {},
): NewPendingReading => ({
  vehicleId: 'v1',
  userId: 'u1',
  km: 50000,
  readingAt: new Date('2026-11-26T08:00:00Z').toISOString(),
  fuelPercent: 75,
  notes: 'plein fait',
  photo: null,
  ...overrides,
})

beforeEach(async () => {
  await store.clear()
})

describe('pendingStore — CRUD de la file (D13)', () => {
  it('add range en mémoire et en base, trié par ancienneté d’entrée', async () => {
    const first = await store.add(base({ km: 49990 }))
    const second = await store.add(base({ km: 50010 }))
    const listed = await store.load()
    expect(listed.map((item) => item.id)).toEqual([first.id, second.id])
    expect(store.getItems()).toEqual(listed)
    expect(first.status).toBe('pending')
    expect(first.insertedReadingId).toBeNull()
  })

  it('conserve le blob photo tel quel (octets locaux, pas une signed URL)', async () => {
    const blob = new Blob(['\u00ffØ jpeg-local'], { type: 'image/jpeg' })
    await store.add(base({ photo: blob }))
    const [item] = await store.load()
    expect(item.photo).toBeInstanceOf(Blob)
    expect(await item.photo!.text()).toBe(await blob.text())
  })

  it('update patche sans perte des champs absents', async () => {
    const item = await store.add(base())
    await store.update(item.id, {
      status: 'conflict',
      lastError: 'KM_REGRESSION',
    })
    const [after] = store.getItems()
    expect(after).toMatchObject({
      id: item.id,
      km: item.km,
      status: 'conflict',
      lastError: 'KM_REGRESSION',
    })
  })

  it('remove et clear vident cache et base (rechargement plus tard)', async () => {
    const item = await store.add(base())
    await store.remove(item.id)
    expect(store.getItems()).toHaveLength(0)
    await store.add(base())
    expect(store.getItems()).toHaveLength(1)
    await store.clear()
    expect(await store.load()).toHaveLength(0)
  })

  it('notifie les abonnés à chaque écriture (useSyncExternalStore)', async () => {
    const seen: number[] = []
    const unsubscribe = store.subscribe(() =>
      seen.push(store.getItems().length),
    )
    await store.add(base())
    await store.update(store.getItems()[0].id, { km: 1 })
    await store.remove(store.getItems()[0].id)
    unsubscribe()
    await store.add(base({ km: 2 })) // post-désabonnement : plus de notif
    expect(seen).toEqual([1, 1, 0])
  })

  it('update sur un id inconnu lève une DataError not_found', async () => {
    await expect(store.update('inexistant', { km: 1 })).rejects.toMatchObject({
      name: 'DataError',
      code: 'not_found',
    })
  })
})
