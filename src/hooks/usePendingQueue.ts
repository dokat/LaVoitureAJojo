// File hors-ligne côté React (D13) : lecture réactive de la file IndexedDB,
// indicateur en-ligne/hors-ligne, et moteur de synchronisation au retour du
// réseau. Le renvoi passe par les mêmes repositories que la saisie en ligne —
// le trigger D6 reste la vérité (notes M6) : un item refusé par la base
// devient « en attente — conflit », éditable ou abandonnable, jamais perdu.
// Milestone 10 (D39) : les items portent une intention — relevé simple (M7),
// ouverture, clôture ou annulation de sortie — rejouée par l'algo partagé de
// tripSync ; le relais est une insertion qui réussit, sans branche dédiée.
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
import { pickSelectedVehicle } from '@/lib/vehicleSelection'
import { DataError } from '@/repositories/errors'
import * as kilometersRepository from '@/repositories/kilometersRepository'
import * as photosRepository from '@/repositories/photosRepository'
import * as vehiclesRepository from '@/repositories/vehiclesRepository'
import {
  freshTripCloseProgress,
  freshTripOpenProgress,
  syncTripCancel,
  syncTripClose,
  syncTripOpen,
  type TripEndpointData,
} from '@/hooks/tripSync'

export type {
  PendingReading,
  PendingIntent,
  PendingStatus,
} from '@/lib/pendingStore'

/** Résultat interne d'un passage de synchro sur un item. */
type ItemOutcome =
  | 'done' // supprimé de la file
  | 'conflict' // marqué en conflit, on passe au suivant
  | 'retry' // réseau retombé en route, on arrête la boucle

let syncLoop: Promise<void> | null = null

/** Les champs de base d'un item, lus comme extrémité de sortie. Pour
 * `tripCancel`, km/date sont des sentinels que la synchro ignore (D39). */
function endpointOf(
  item: PendingReading,
  side: 'start' | 'end',
): TripEndpointData {
  return side === 'start'
    ? {
        km: item.km,
        readingAt: new Date(item.readingAt),
        fuelPercent: item.fuelPercent,
        notes: item.notes,
        photo: item.photo,
      }
    : {
        km: item.endKm ?? 0,
        readingAt: new Date(item.endReadingAt ?? item.readingAt),
        fuelPercent: item.endFuelPercent ?? null,
        notes: item.endNotes ?? null,
        photo: item.endPhoto ?? null,
      }
}

/** Item « tripOpen » : les marqueurs du store se mappent sur la progression
 * de l'algo partagé (D39) ; l'item ne sort de la file qu'une fois TOUT écrit
 * (relevés, ligne, photos — jamais de perte silencieuse, D13). */
async function syncTripOpenItem(
  item: PendingReading,
  userId: string,
): Promise<void> {
  const progress = freshTripOpenProgress()
  progress.vehicleId = item.vehicleId
  progress.startReadingId = item.insertedReadingId
  progress.startPhotoPath = item.uploadedPhotoPath
  progress.endReadingId = item.insertedEndReadingId ?? null
  progress.endPhotoPath = item.uploadedEndPhotoPath ?? null
  progress.tripId = item.tripId ?? null
  await syncTripOpen(
    {
      vehicleId: item.vehicleId,
      userId,
      start: endpointOf(item, 'start'),
      end: item.endKm == null ? null : endpointOf(item, 'end'),
    },
    progress,
    (p) =>
      pendingStore.update(item.id, {
        vehicleId: p.vehicleId,
        insertedReadingId: p.startReadingId,
        uploadedPhotoPath: p.startPhotoPath,
        insertedEndReadingId: p.endReadingId,
        uploadedEndPhotoPath: p.endPhotoPath,
        tripId: p.tripId,
      }),
  )
}

/** Item « tripClose » : les champs de base portent le relevé d'ARRIVÉE ; la
 * cible est `tripId`, posé à la mise en file (sinon item incohérent → conflit). */
async function syncTripCloseItem(
  item: PendingReading,
  userId: string,
): Promise<void> {
  if (!item.tripId) {
    throw new DataError(
      'not_found',
      'Item de clôture sans sortie cible — abandonnez-le et refaites ' +
        'l\u2019action en ligne.',
    )
  }
  const progress = freshTripCloseProgress()
  progress.vehicleId = item.vehicleId
  progress.endReadingId = item.insertedReadingId
  progress.endPhotoPath = item.uploadedPhotoPath
  await syncTripClose(
    {
      targetTripId: item.tripId,
      vehicleId: item.vehicleId,
      userId,
      end: endpointOf(item, 'start'),
    },
    progress,
    (p) =>
      pendingStore.update(item.id, {
        vehicleId: p.vehicleId,
        insertedReadingId: p.endReadingId,
        uploadedPhotoPath: p.endPhotoPath,
      }),
  )
}

async function syncTripCancelItem(item: PendingReading): Promise<void> {
  if (!item.tripId) {
    throw new DataError(
      'not_found',
      'Item d\u2019annulation sans sortie cible — abandonnez-le et refaites ' +
        'l\u2019action en ligne.',
    )
  }
  await syncTripCancel(item.tripId)
}

/** Item relevé simple (M7) : insert → upload → attach, trois étapes
 * idempotentes (D25/D29), inchangées depuis le milestone 7. */
async function syncReadingItem(
  item: PendingReading,
  userId: string,
): Promise<void> {
  // Étape 1 : insertion SQL (jamais réessayée si déjà insérée : D7/D25 —
  // on reprendrait à l'upload, jamais on ne crée un doublon).
  let readingId = item.insertedReadingId
  if (!readingId) {
    const vehicleId =
      item.vehicleId ??
      pickSelectedVehicle(await vehiclesRepository.listVehicles())?.id ??
      null
    if (!vehicleId) {
      throw new DataError(
        'not_found',
        'Aucun véhicule dans la flotte — prévenez l\u2019administrateur.',
      )
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
}

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
    switch (item.intent ?? 'reading') {
      case 'reading':
        await syncReadingItem(item, userId)
        break
      case 'tripOpen':
        await syncTripOpenItem(item, userId)
        break
      case 'tripClose':
        await syncTripCloseItem(item, userId)
        break
      case 'tripCancel':
        await syncTripCancelItem(item)
        break
    }
    await pendingStore.remove(item.id)
    return 'done'
  } catch (caught) {
    const error =
      caught instanceof DataError
        ? caught
        : new DataError('unknown', String(caught), caught)
    if (error.code === 'network') return 'retry'
    // Échec déterministe (D6, D34, droits, véhicule absent) : le contrat D13
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
