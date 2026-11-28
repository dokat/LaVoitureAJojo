// File d'attente hors-ligne (D13) : IndexedDB, source de vérité locale des
// relevés saisis sans réseau. Jamais de suppression silencieuse : un item ne
// quitte la file que (a) synchronisé avec succès, (b) abandon explicité par
// l'utilisateur. Le quota navigateur est géré par ce tri : on ne nettoie que
// les items synchronisés (cf. Dette du plan) — ici, la suppression au succès.
//
// Ce module parle à IndexedDB, pas à supabase-js : il vit dans lib/, pas dans
// repositories/ (règle D10). Les hooks orchestrent, les composants lisent.
import { DataError } from '@/repositories/errors'

export type PendingStatus = 'pending' | 'conflict'

/**
 * Intention d'un item (D39) : `reading` est le cas né au M7 (relevé seul) ;
 * `tripOpen` ouvre une sortie (les champs de base portent le relevé de DÉPART,
 * les champs `end*` l'arrivée éventuelle d'une rétro-saisie D31) ; `tripClose`
 * clôt la sortie `tripId` (les champs de base portent alors le relevé
 * d'ARRIVÉE) ; `tripCancel` annule la sortie `tripId` (aucun relevé — les
 * champs de base sont des sentinels que le synchroniseur ignore).
 * Absent = `reading` : les items nés avant le M10 gardent leur sémantique.
 */
export type PendingIntent = 'reading' | 'tripOpen' | 'tripClose' | 'tripCancel'

/** Un relevé en attente de synchro. `readingAt` porte la sémantique D14 :
 * l'horodatage de la manipulation utilisateur, figé à la saisie, pas à l'envoi. */
export type PendingReading = {
  id: string
  /** Résolu à la saisie si connu ; le synchroniseur retombe sur le choix du
   * navigateur qui envoie sinon (D44 — le trigger D6 reste la vérité au
   * renvoi). */
  vehicleId: string | null
  userId: string | null
  km: number
  /** ISO — date locale du geste utilisateur (D14). */
  readingAt: string
  fuelPercent: number | null
  notes: string | null
  /** JPEG déjà compressé (D16) : la compression locale fonctionne hors-ligne. */
  photo: Blob | null
  /** Ordre d'entrée dans la file = ordre de renvoi (chronologie d'envoi).
   * `createdAt` seul ne suffit pas (deux saisies dans la même milliseconde) :
   * `seq` est un compteur local strictement croissant, tie-break exact. */
  createdAt: string
  seq: number
  status: PendingStatus
  /** Message du dernier échec (affiché avec le badge « conflit », D13). */
  lastError: string | null
  /** Étape de reprise (D25 inversé) : si l'insertion a réussi mais pas
   * l'upload photo, on ne réinsère jamais — on reprend à l'upload. Pour une
   * intention sortie, ces deux champs portent l'extrémité principale de
   * l'item : départ (`tripOpen`) ou arrivée (`tripClose`). */
  insertedReadingId: string | null
  uploadedPhotoPath: string | null
  /** Intention sortie (D39) ; undefined = `reading` (items nés au M7). */
  intent?: PendingIntent
  /** Sortie : cible pour `tripClose`/`tripCancel` (figée à la mise en file),
   * ligne déjà insérée pour `tripOpen` (marqueur de reprise D39). */
  tripId?: string | null
  /** Extrémité arrivée d'une ouverture rétroactive (D31) — null/absent sinon. */
  endKm?: number | null
  endReadingAt?: string | null
  endFuelPercent?: number | null
  endNotes?: string | null
  endPhoto?: Blob | null
  /** Marqueurs de reprise propres à `tripOpen` (D39, même loi que ci-dessus). */
  insertedEndReadingId?: string | null
  uploadedEndPhotoPath?: string | null
}

export type NewPendingReading = Omit<
  PendingReading,
  | 'id'
  | 'createdAt'
  | 'seq'
  | 'status'
  | 'lastError'
  | 'insertedReadingId'
  | 'uploadedPhotoPath'
  | 'insertedEndReadingId'
  | 'uploadedEndPhotoPath'
>

const DB_NAME = 'lavoitureajojo'
const DB_VERSION = 1
const STORE = 'pending'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(
        new Error('IndexedDB bloqué — fermez les autres onglets de l’app.'),
      )
  })
}

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb()
  return dbPromise
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return db().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode)
        const request = run(transaction.objectStore(STORE))
        request.onsuccess = () => resolve(request.result as T)
        request.onerror = () => reject(request.error)
      }),
  )
}

// — Cache mémoire + abonnement (pattern useSyncExternalStore) —
// La file est petite (échelle D1) : on garde tout en mémoire et on notifie
// après chaque écriture. Le snapshot change de référence uniquement quand la
// file change — c'est ce que React compare.

let cache: PendingReading[] = []
const listeners = new Set<() => void>()

function setCache(items: PendingReading[]): void {
  cache = [...items].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.seq - b.seq,
  )
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Snapshot synchrone pour useSyncExternalStore (après `load()`, vide avant). */
export function getItems(): PendingReading[] {
  return cache
}

export async function load(): Promise<PendingReading[]> {
  try {
    const items: PendingReading[] = await tx('readonly', (store) =>
      store.getAll(),
    )
    setCache(items)
    return getItems() // ordre canonique : getAll suit la clé, pas l'antériorité
  } catch (caught) {
    // Private mode / stockage nié : la file tombe en grâce douce — l'UI
    // reste utilisable en ligne, c'est la saisie hors-ligne qui est perdue.
    throw new DataError(
      'unknown',
      `File hors-ligne indisponible : ${String(caught)}`,
      caught,
    )
  }
}

export async function add(item: NewPendingReading): Promise<PendingReading> {
  const entry: PendingReading = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    seq: Math.max(0, ...cache.map((existing) => existing.seq)) + 1,
    status: 'pending',
    lastError: null,
    insertedReadingId: null,
    uploadedPhotoPath: null,
  }
  await tx('readwrite', (store) => store.put(entry))
  setCache([...cache, entry])
  return entry
}

export async function update(
  id: string,
  patch: Partial<Omit<PendingReading, 'id'>>,
): Promise<void> {
  const current = cache.find((item) => item.id === id)
  if (!current)
    throw new DataError('not_found', 'Item absent de la file hors-ligne.')
  const next: PendingReading = { ...current, ...patch }
  await tx('readwrite', (store) => store.put(next))
  setCache(cache.map((item) => (item.id === id ? next : item)))
}

/** Sortie de file — appelée uniquement après succès de synchro ou abandon
 * confirmé par l'utilisateur (D13 : jamais en silence). */
export async function remove(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id))
  setCache(cache.filter((item) => item.id !== id))
}

/** Purge de test / réinitialisation violente — hors chemin applicatif. */
export async function clear(): Promise<void> {
  await tx('readwrite', (store) => store.clear())
  setCache([])
}
