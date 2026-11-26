// File hors-ligne côté React (D13) : lecture réactive de la file IndexedDB,
// indicateur en-ligne/hors-ligne, et moteur de synchronisation au retour du
// réseau. Le renvoi passe par les mêmes repositories que la saisie en ligne —
// le trigger D6 reste la vérité (notes M6) : un item refusé par la base
// devient « en attente — conflit », éditable ou abandonnable, jamais perdu.
//
// Le moteur vit au niveau module (pas du hook) : plusieurs instances montées
// (indicateur AppShell + écran file) partagent une seule boucle de synchro.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useAuth } from '@/hooks/useAuth'
import * as pendingStore from '@/lib/pendingStore'
import type { PendingReading } from '@/lib/pendingStore'
import { DataError } from '@/repositories/errors'
import * as kilometersRepository from '@/repositories/kilometersRepository'
import * as photosRepository from '@/repositories/photosRepository'
import * as vehiclesRepository from '@/repositories/vehiclesRepository'

export type { PendingReading, PendingStatus } from '@/lib/pendingStore'

/** Résultat interne d'un passage de synchro sur un item. */
type ItemOutcome =
  | 'done' // supprimé de la file
  | 'conflict' // marqué en conflit, on passe au suivant
  | 'retry' // réseau retombé en route, on arrête la boucle

let syncLoop: Promise<void> | null = null

async function syncOne(
  item: PendingReading,
  sessionUserId: string | null,
): Promise<ItemOutcome> {
  const userId = item.userId ?? sessionUserId
  if (!userId) {
    await pendingStore.update(item.id, {
      status: 'conflict',
      lastError: 'Session indisponible — reconnectez-vous pour synchroniser.',
    })
    return 'conflict'
  }
  try {
    // Étape 1 : insertion SQL (jamais réessayée si déjà insérée : D7/D25 —
    // on reprendrait à l'upload, jamais on ne crée un doublon).
    let readingId = item.insertedReadingId
    if (!readingId) {
      const vehicleId =
        item.vehicleId ??
        (await vehiclesRepository.getActiveVehicle())?.id ??
        null
      if (!vehicleId) {
        await pendingStore.update(item.id, {
          status: 'conflict',
          lastError:
            'Aucun véhicule actif — l\u2019administrateur doit en activer un.',
        })
        return 'conflict'
      }
      const reading = await kilometersRepository.insertReading({
        vehicleId,
        userId,
        km: item.km,
        readingAt: new Date(item.readingAt),
        fuelPercent: item.fuelPercent,
        notes: item.notes,
      })
      readingId = reading.id
      await pendingStore.update(item.id, { insertedReadingId: reading.id })
    }
    // Étape 2 : upload des octets (reprise si l'insertion était déjà partie).
    let photoPath = item.uploadedPhotoPath
    if (item.photo && !photoPath) {
      photoPath = await photosRepository.uploadPhoto(
        userId,
        readingId,
        item.photo,
      )
      await pendingStore.update(item.id, { uploadedPhotoPath: photoPath })
    }
    // Étape 3 : collage du chemin sur la ligne — idempotent, réessayable.
    if (item.photo && photoPath) {
      await kilometersRepository.attachPhoto(readingId, photoPath)
    }
    await pendingStore.remove(item.id)
    return 'done'
  } catch (caught) {
    const error =
      caught instanceof DataError
        ? caught
        : new DataError('unknown', String(caught), caught)
    if (error.code === 'network') return 'retry'
    // Échec déterministe (D6, permissions, véhicule absent) : le contrat D13
    // garde l'item avec un badge « conflit » et le message, éditable ou
    // abandonnable par l'utilisateur.
    await pendingStore.update(item.id, {
      status: 'conflict',
      lastError: error.message,
    })
    return 'conflict'
  }
}

async function runSync(sessionUserId: string | null): Promise<void> {
  if (syncLoop) return syncLoop
  syncLoop = (async () => {
    try {
      await pendingStore.load()
      // Relecture de la file à chaque tour (pas un snapshot figé) : un item
      // qui entre PENDANT la synchro est attrapé, pas renvoyé à l'événement
      // online suivant. Ordre = ancienneté d'entrée (D14 + trigger D6).
      for (;;) {
        if (!navigator.onLine) break
        const next = pendingStore
          .getItems()
          .find((item) => item.status === 'pending')
        if (!next) break
        const outcome = await syncOne(next, sessionUserId)
        if (outcome === 'retry') break
      }
    } catch {
      // load() en erreur (stockage nié) : rien de synchro possible, l'UI en
      // ligne reste fonctionnelle — pas de crash du shell.
    }
  })().finally(() => {
    syncLoop = null
  })
  return syncLoop
}

export function usePendingQueue() {
  const { user } = useAuth()
  const items = useSyncExternalStore(
    pendingStore.subscribe,
    pendingStore.getItems,
    pendingStore.getItems,
  )
  const [online, setOnline] = useState(() => navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const userIdRef = useRef<string | null>(user?.id ?? null)
  // Tenir l'identifiant à jour sans écrire dans le ref pendant le rendu
  // (règle react/refs) : les callbacks de synchro lisent toujours le courant.
  useEffect(() => {
    userIdRef.current = user?.id ?? null
  }, [user?.id])

  const syncNow = useCallback(async () => {
    setSyncing(true)
    try {
      await runSync(userIdRef.current)
    } finally {
      setSyncing(false)
    }
  }, [])

  // Chargement de la file au montage, puis renvoi immédiat si en ligne (des
  // items peuvent attendre depuis une session hors-ligne précédente).
  useEffect(() => {
    void pendingStore
      .load()
      .then(() => runSync(userIdRef.current))
      .catch(() => undefined)
  }, [])

  // Retour du réseau → synchro automatique (D13).
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      void runSync(userIdRef.current)
    }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Un item qui entre (ou change) pendant que la session est montée retente
  // la synchro tout de suite : en ligne, le cas « insert a échoué puis file »
  // ne doit pas attendre l'événement online suivant.
  useEffect(
    () =>
      pendingStore.subscribe(() => {
        if (navigator.onLine) void runSync(userIdRef.current)
      }),
    [],
  )

  /** Édition d'un item (notamment en conflit) : la correction le remet en
   * attente et retente immédiatement la synchro (D13). */
  const editItem = useCallback(
    async (id: string, patch: Partial<Omit<PendingReading, 'id'>>) => {
      await pendingStore.update(id, {
        ...patch,
        status: 'pending',
        lastError: null,
      })
      await runSync(userIdRef.current)
    },
    [],
  )

  /** Abandon (D13) : suppression locale explicite — l'appelant a confirmé. */
  const discardItem = useCallback((id: string) => pendingStore.remove(id), [])

  return {
    items,
    count: items.length,
    conflicts: items.filter((item) => item.status === 'conflict').length,
    online,
    syncing,
    syncNow,
    editItem,
    discardItem,
  }
}
