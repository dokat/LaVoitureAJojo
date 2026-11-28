// Hook du modèle « sortie » (D30→D39) : liste des sorties enrichie de ses
// relevés (jonction par id côté hook, pas de jointure au repository), sortie
// en cours dérivée (D35), et actions ouvrir / clôturer / annuler / supprimer /
// restaurer. validations AVANT envoi : D6 via useOdometerValidation (la base
// garde la vérité), D34 re-jouée par validateTripOrder, relais D35 détecté
// côté client quand la sortie ouverte est chargée — le trigger tranche sinon.
// Hors-ligne (D39) : l'action file son intention (tripOpen / tripClose /
// tripCancel) avec les marqueurs de reprise ; en ligne, c'est le même algo
// (tripSync) qui écrit, marqueurs en mémoire.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useOdometerValidation,
  type OdometerPoint,
} from '@/hooks/useOdometerValidation'
import {
  freshTripCloseProgress,
  freshTripOpenProgress,
  syncTripClose,
  syncTripOpen,
  type TripEndpointData,
} from '@/hooks/tripSync'
import { compressPhoto, ImageError } from '@/lib/images'
import * as pendingStore from '@/lib/pendingStore'
import * as kilometersRepository from '@/repositories/kilometersRepository'
import * as tripsRepository from '@/repositories/tripsRepository'
import { DataError, toDataError, TripError } from '@/repositories/errors'
import type { Reading } from '@/schemas/kilometers'
import type { Trip } from '@/schemas/trips'

export type TripsStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Sortie + ses relevés rejoints par id (D38). Les lectures mortes restent
 * attachées (toggle admin M11) : une sortie soft-deleted se montre et se
 * restaure par agrégat (D37). */
export type TripEntry = {
  trip: Trip
  startReading: Reading | null
  endReading: Reading | null
  /** km arrivée − km départ (D38) ; null tant qu'en cours ou relevé manquant. */
  distanceKm: number | null
  isOpen: boolean
}

/** Ce que le formulaire donne pour une extrémité (D32) : le strict miroir de
 * la saisie M5, photo incluse. */
export type TripEndpointInput = {
  km: number
  /** Date de la manipulation (D14), pré-remplie « maintenant ». */
  readingAt: Date
  fuelPercent?: number | null
  notes?: string | null
  photo?: Blob | null
}

/** Vivante : ni annulée (D36), ni supprimée par contagion des relevés (D33).
 * Verdict partagé par toutes les vues membres (historique M11, carte
 * « dernières sorties » du dashboard) — le toggle admin reste un affichage. */
export function isLiveTrip(entry: TripEntry): boolean {
  if (entry.trip.cancelledAt !== null) return false
  if (entry.startReading === null || entry.startReading.deletedAt !== null) {
    return false
  }
  if (entry.trip.endReadingId === null) return true
  return entry.endReading !== null && entry.endReading.deletedAt === null
}

export type StartTripResult =
  | { ok: true; tripId: string | null; photoError?: DataError }
  /** Ouverture mise en file (D39) : rien en base encore, tout est local. */
  | { ok: true; queued: true }
  | { ok: false; error: DataError }

export type CompleteTripResult =
  | { ok: true; photoError?: DataError }
  | { ok: true; queued: true }
  | { ok: false; error: DataError }

const kmFormat = new Intl.NumberFormat('fr-FR')
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
})

/** Verdict de la règle interne D34 (et de son miroir relais D35), rejouée
 * côté client avant envoi — la base garde la vérité par le trigger M9. */
export type TripOrderVerdict =
  | { ok: true }
  | {
      ok: false
      code: 'trip_km_order' | 'trip_date_order' | 'trip_relay_conflict'
      message: string
    }

/** Version pure, testable sans React (patron `validateOdometer`). */
export function validateTripOrder(
  start: OdometerPoint,
  end: OdometerPoint,
  options: { relay?: boolean } = {},
): TripOrderVerdict {
  const relay = options.relay === true
  if (Number.isNaN(end.readingAt.getTime())) {
    return {
      ok: false,
      code: 'trip_date_order',
      message: 'La date d\u2019arrivée est invalide.',
    }
  }
  if (end.km < start.km) {
    return {
      ok: false,
      code: relay ? 'trip_relay_conflict' : 'trip_km_order',
      message: relay
        ? `Ce relevé clôturerait la sortie en cours à ${kmFormat.format(end.km)} km, ` +
          `sous son départ (${kmFormat.format(start.km)} km) : vérifiez le ` +
          'compteur, ou demandez à l\u2019admin (D35).'
        : `Arrivée refusée : ${kmFormat.format(end.km)} km < départ ` +
          `${kmFormat.format(start.km)} km — une sortie ne peut pas finir plus ` +
          'bas qu\u2019elle n\u2019a commencé (D34).',
    }
  }
  if (end.readingAt < start.readingAt) {
    return {
      ok: false,
      code: relay ? 'trip_relay_conflict' : 'trip_date_order',
      message: relay
        ? 'Ce relevé est daté avant le départ de la sortie en cours ' +
          `(${dateFormat.format(start.readingAt)}) : vérifiez les dates, ou ` +
          'demandez à l\u2019admin (D35).'
        : `Date d\u2019arrivée (${dateFormat.format(end.readingAt)}) antérieure ` +
          `au départ (${dateFormat.format(start.readingAt)}) : une sortie se ` +
          'clôt après son ouverture (D34).',
    }
  }
  return { ok: true }
}

/** ImageError (pré-traitement local) et erreurs base convergent vers DataError
 * (patron useReadings). */
function describe(error: unknown): DataError {
  if (error instanceof ImageError) {
    return new DataError(
      error.code === 'too_large' ? 'photo_upload' : 'unknown',
      error.message,
      error,
    )
  }
  return toDataError(error)
}

const endpoint = (
  input: TripEndpointInput,
  photo: Blob | null,
): TripEndpointData => ({
  km: input.km,
  readingAt: input.readingAt,
  fuelPercent: input.fuelPercent ?? null,
  notes: input.notes ?? null,
  photo,
})

export function useTrips(vehicleId: string | null) {
  const { user } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [readings, setReadings] = useState<Reading[]>([])
  const [status, setStatus] = useState<TripsStatus>('idle')
  const [error, setError] = useState<DataError | null>(null)

  const fetchAndApply = useCallback(async (): Promise<DataError | null> => {
    if (!vehicleId) {
      setTrips([])
      setReadings([])
      setError(null)
      setStatus('idle')
      return null
    }
    try {
      const [tripRows, readingRows] = await Promise.all([
        tripsRepository.fetchTrips(vehicleId),
        // Les mortes sont chargées aussi : une sortie soft-deleted reste
        // affichable (badge) et restaurant par agrégat (D37, toggle M11).
        kilometersRepository.listReadings(vehicleId, { includeDeleted: true }),
      ])
      setTrips(tripRows)
      setReadings(readingRows)
      setError(null)
      setStatus('ready')
      return null
    } catch (caught) {
      const failure = describe(caught)
      setError(failure)
      setStatus('error')
      return failure
    }
  }, [vehicleId])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- setState après await uniquement (fetch de montage, pas de lib de données)
    void fetchAndApply()
  }, [fetchAndApply])

  const reload = useCallback(async (): Promise<DataError | null> => {
    setStatus('loading')
    return fetchAndApply()
  }, [fetchAndApply])

  const readingsById = useMemo(
    () => new Map(readings.map((reading) => [reading.id, reading])),
    [readings],
  )

  /** Jonction par id — pas de jointure SQL (consigne M10). */
  const entries = useMemo<TripEntry[]>(
    () =>
      trips.map((trip) => {
        const startReading = readingsById.get(trip.startReadingId) ?? null
        const endReading = trip.endReadingId
          ? (readingsById.get(trip.endReadingId) ?? null)
          : null
        return {
          trip,
          startReading,
          endReading,
          distanceKm:
            startReading && endReading ? endReading.km - startReading.km : null,
          isOpen: trip.endReadingId === null && trip.cancelledAt === null,
        }
      }),
    [trips, readingsById],
  )

  /** La sortie en cours (D35 : au plus une par véhicule vivant). */
  const openTrip = useMemo(
    () => entries.find((entry) => entry.isOpen) ?? null,
    [entries],
  )

  /** Point d'appui D6 : premier relevé VIVANT du tri de récence (patron M6). */
  const lastReading = useMemo<OdometerPoint | null>(() => {
    const latest =
      readings.find((reading) => reading.deletedAt === null) ?? null
    return latest ? { km: latest.km, readingAt: latest.readingAt } : null
  }, [readings])

  const validateOdometer = useOdometerValidation(lastReading)

  /**
   * Ouvrir une sortie (D31 : `end` présent ⇒ née clôturée — rétro-saisie).
   * Validations d'abord (D6 aux extrémités, D34 entre elles, relais D35 si
   * une sortie ouverte est chargée), puis écritures — ou mise en file (D39).
   */
  const startTrip = useCallback(
    async (input: {
      start: TripEndpointInput
      end?: TripEndpointInput | null
    }): Promise<StartTripResult> => {
      if (!user) {
        return {
          ok: false,
          error: new DataError(
            'not_found',
            'Session indisponible — rechargez.',
          ),
        }
      }
      // Véhicule inconnu (montage hors-ligne, échec de résolution réseau) : en
      // ligne c'est une erreur déterministe — la page n'a rien à envoyer.
      // Hors-ligne, on ne bloque pas : l'item file avec `vehicleId: null` et
      // le synchroniseur résoudra le choix du navigateur au renvoi (patron M7).
      if (!vehicleId && navigator.onLine) {
        return {
          ok: false,
          error: new DataError(
            'not_found',
            'Aucun véhicule dans la flotte — prévenez l\u2019administrateur.',
          ),
        }
      }
      const startPoint: OdometerPoint = {
        km: input.start.km,
        readingAt: input.start.readingAt,
      }
      const startVerdict = validateOdometer(startPoint)
      if (!startVerdict.ok) {
        return {
          ok: false,
          error: new DataError('km_regression', startVerdict.message),
        }
      }
      let endPoint: OdometerPoint | null = null
      if (input.end) {
        endPoint = { km: input.end.km, readingAt: input.end.readingAt }
        const endVerdict = validateOdometer(endPoint)
        if (!endVerdict.ok) {
          return {
            ok: false,
            error: new DataError('km_regression', endVerdict.message),
          }
        }
        const orderVerdict = validateTripOrder(startPoint, endPoint)
        if (!orderVerdict.ok) {
          return {
            ok: false,
            error: new TripError(orderVerdict.code, orderVerdict.message),
          }
        }
      }
      // Relais (D35) : si une sortie ouverte est chargée, le relevé de départ
      // la clôturera — D34 rejouée contre SON départ, jamais de cap silencieux.
      if (openTrip?.startReading) {
        const relayVerdict = validateTripOrder(
          {
            km: openTrip.startReading.km,
            readingAt: openTrip.startReading.readingAt,
          },
          startPoint,
          { relay: true },
        )
        if (!relayVerdict.ok) {
          return {
            ok: false,
            error: new TripError(relayVerdict.code, relayVerdict.message),
          }
        }
      }
      // Compression locale d'abord (D16) : elle fonctionne hors-ligne et la
      // file ne garde que des octets conformes au quota (patron M7).
      let startPhoto: Blob | null = null
      let endPhoto: Blob | null = null
      try {
        if (input.start.photo)
          startPhoto = (await compressPhoto(input.start.photo)).blob
        if (input.end?.photo)
          endPhoto = (await compressPhoto(input.end.photo)).blob
      } catch (caught) {
        return { ok: false, error: describe(caught) }
      }
      const startData = endpoint(input.start, startPhoto)
      const endData = input.end ? endpoint(input.end, endPhoto) : null
      const enqueue = async (
        progress: ReturnType<typeof freshTripOpenProgress>,
      ) => {
        const item = await pendingStore.add({
          vehicleId,
          userId: user.id,
          km: startData.km,
          readingAt: startData.readingAt.toISOString(),
          fuelPercent: startData.fuelPercent,
          notes: startData.notes,
          photo: startData.photo,
          intent: 'tripOpen',
          ...(endData
            ? {
                endKm: endData.km,
                endReadingAt: endData.readingAt.toISOString(),
                endFuelPercent: endData.fuelPercent,
                endNotes: endData.notes,
                endPhoto: endData.photo,
              }
            : {}),
        })
        await pendingStore.update(item.id, {
          insertedReadingId: progress.startReadingId,
          insertedEndReadingId: progress.endReadingId,
          tripId: progress.tripId,
          uploadedPhotoPath: progress.startPhotoPath,
          uploadedEndPhotoPath: progress.endPhotoPath,
        })
      }
      if (!navigator.onLine) {
        await enqueue(freshTripOpenProgress())
        return { ok: true, queued: true }
      }
      // En ligne : même algo, marqueurs en mémoire — une coupure en plein
      // vol file l'item AVEC sa progression, le renvoi ne réinsère rien (D39).
      const progress = freshTripOpenProgress()
      try {
        await syncTripOpen(
          { vehicleId, userId: user.id, start: startData, end: endData },
          progress,
          async () => {},
        )
        await fetchAndApply()
        return { ok: true, tripId: progress.tripId }
      } catch (caught) {
        const failure = describe(caught)
        if (failure.code === 'network') {
          await enqueue(progress)
          return { ok: true, queued: true }
        }
        if (progress.tripId) {
          // La sortie est intégralement en base : seul un envoi photo a
          // échoué (déterministe) — esprit D25, on affiche, on ne défait rien.
          await fetchAndApply()
          return { ok: true, tripId: progress.tripId, photoError: failure }
        }
        // Refus du trigger (relais, D6) : des relevés ont pu rester insérés
        // (course) — la liste rechargée montre la chronologie réelle.
        await fetchAndApply()
        return { ok: false, error: failure }
      }
    },
    [user, vehicleId, validateOdometer, openTrip, fetchAndApply],
  )

  /**
   * Clôturer une sortie : relevé d'arrivée sous D6 + D34 (contre le départ
   * chargé ; sinon le trigger tranche), puis UPDATE `trips`. Hors-ligne : item
   * `tripClose` dont les champs de base portent l'arrivée (D39).
   */
  const completeTrip = useCallback(
    async (
      tripId: string,
      endInput: TripEndpointInput,
    ): Promise<CompleteTripResult> => {
      if (!user) {
        return {
          ok: false,
          error: new DataError(
            'not_found',
            'Session indisponible — rechargez.',
          ),
        }
      }
      const entry = entries.find((candidate) => candidate.trip.id === tripId)
      const endPoint: OdometerPoint = {
        km: endInput.km,
        readingAt: endInput.readingAt,
      }
      const odometerVerdict = validateOdometer(endPoint)
      if (!odometerVerdict.ok) {
        return {
          ok: false,
          error: new DataError('km_regression', odometerVerdict.message),
        }
      }
      if (entry?.startReading) {
        const orderVerdict = validateTripOrder(
          {
            km: entry.startReading.km,
            readingAt: entry.startReading.readingAt,
          },
          endPoint,
        )
        if (!orderVerdict.ok) {
          return {
            ok: false,
            error: new TripError(orderVerdict.code, orderVerdict.message),
          }
        }
      }
      let endPhoto: Blob | null = null
      try {
        if (endInput.photo)
          endPhoto = (await compressPhoto(endInput.photo)).blob
      } catch (caught) {
        return { ok: false, error: describe(caught) }
      }
      const endData = endpoint(endInput, endPhoto)
      const enqueue = async (
        progress: ReturnType<typeof freshTripCloseProgress>,
      ) => {
        const item = await pendingStore.add({
          vehicleId: vehicleId ?? progress.vehicleId,
          userId: user.id,
          km: endData.km,
          readingAt: endData.readingAt.toISOString(),
          fuelPercent: endData.fuelPercent,
          notes: endData.notes,
          photo: endData.photo,
          intent: 'tripClose',
          tripId,
        })
        await pendingStore.update(item.id, {
          insertedReadingId: progress.endReadingId,
          uploadedPhotoPath: progress.endPhotoPath,
        })
      }
      if (!navigator.onLine) {
        await enqueue({ ...freshTripCloseProgress(), vehicleId })
        return { ok: true, queued: true }
      }
      const progress = { ...freshTripCloseProgress(), vehicleId }
      try {
        await syncTripClose(
          {
            targetTripId: tripId,
            vehicleId,
            userId: user.id,
            end: endData,
          },
          progress,
          async () => {},
        )
        await fetchAndApply()
        return { ok: true }
      } catch (caught) {
        const failure = describe(caught)
        if (failure.code === 'network') {
          await enqueue(progress)
          return { ok: true, queued: true }
        }
        await fetchAndApply()
        return { ok: false, error: failure }
      }
    },
    [entries, user, vehicleId, validateOdometer, fetchAndApply],
  )

  /** Annuler une sortie en cours (D36) : un seul UPDATE en ligne (le trigger
   * soft-delete le départ en miroir) ; hors-ligne — ou réseau lâché en plein
   * vol — item `tripCancel`, un UPDATE idempotent au renvoi (D39). */
  const cancelTrip = useCallback(
    async (tripId: string): Promise<DataError | null> => {
      if (!user) {
        return new DataError('not_found', 'Session indisponible — rechargez.')
      }
      const queue = async (): Promise<DataError | null> => {
        await pendingStore.add({
          vehicleId,
          userId: user.id,
          // Sentinelles ignorées par le moteur pour cette intention (D39) :
          // une annulation ne porte aucun relevé.
          km: 0,
          readingAt: new Date().toISOString(),
          fuelPercent: null,
          notes: null,
          photo: null,
          intent: 'tripCancel',
          tripId,
        })
        return null
      }
      if (!navigator.onLine) return queue()
      try {
        await tripsRepository.cancelTrip(tripId)
        await fetchAndApply()
        return null
      } catch (caught) {
        const failure = describe(caught)
        if (failure.code === 'network') return queue()
        await fetchAndApply()
        return failure
      }
    },
    [user, vehicleId, fetchAndApply],
  )

  /** Supprimer une sortie clôturée (D33) : contagion par les deux relevés,
   * aucune écriture sur `trips`. En ligne seulement (hors du périmètre D39). */
  const deleteTrip = useCallback(
    async (tripId: string): Promise<DataError | null> => {
      if (!user) {
        return new DataError('not_found', 'Session indisponible — rechargez.')
      }
      const trip = trips.find((candidate) => candidate.id === tripId)
      if (!trip) {
        return new DataError('not_found', 'Sortie introuvable — rechargez.')
      }
      try {
        await tripsRepository.deleteTrip(trip, user.id)
        await fetchAndApply()
        return null
      } catch (caught) {
        await fetchAndApply()
        return describe(caught)
      }
    },
    [user, trips, fetchAndApply],
  )

  /** Restauration par agrégat (D37, admin) : la branche (levée d'annulation
   * ou reposed des relevés) vit dans le repository. */
  const restoreTrip = useCallback(
    async (tripId: string): Promise<DataError | null> => {
      const trip = trips.find((candidate) => candidate.id === tripId)
      if (!trip) {
        return new DataError('not_found', 'Sortie introuvable — rechargez.')
      }
      try {
        await tripsRepository.restoreTrip(trip)
        await fetchAndApply()
        return null
      } catch (caught) {
        // Le trigger D18 a pu tout annuler : on relit, jamais d'optimisme.
        await fetchAndApply()
        return describe(caught)
      }
    },
    [trips, fetchAndApply],
  )

  return {
    status,
    error,
    entries,
    trips,
    readings,
    openTrip,
    lastReading,
    startTrip,
    completeTrip,
    cancelTrip,
    deleteTrip,
    restoreTrip,
    reload,
  }
}
