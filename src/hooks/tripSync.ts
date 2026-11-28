// Algorithme de synchronisation des intentions sortie (D39) — partagé entre
// le moteur de la file (usePendingQueue) et les actions en ligne (useTrips) :
// les étapes sont les mêmes, seule la persistance des marqueurs change (store
// IndexedDB d'un côté, mémoire de l'appelant de l'autre). Un marqueur posé
// n'est jamais refait (D29) : relevé inséré ⇒ on ne réinsère pas, ligne trips
// insérée ⇒ on ne réinsère pas ; la clôture et l'annulation sont des UPDATE
// idempotents côté trigger (notes M9). Aucune branche « conflit relais » ici :
// le relais est une insertion qui réussit (D39), le conflit n'existe que sur
// erreur déterministe, traitée par l'appelant.
import { DataError } from '@/repositories/errors'
import { pickSelectedVehicle } from '@/lib/vehicleSelection'
import * as kilometersRepository from '@/repositories/kilometersRepository'
import * as photosRepository from '@/repositories/photosRepository'
import * as tripsRepository from '@/repositories/tripsRepository'
import * as vehiclesRepository from '@/repositories/vehiclesRepository'

/** Un relevé d'extrémité tel que vu de la file : la date est figée en ISO
 * depuis la manipulation locale (D14), la photo est déjà compressée (D16). */
export type TripEndpointData = {
  km: number
  readingAt: Date
  fuelPercent: number | null
  notes: string | null
  photo: Blob | null
}

export type TripOpenProgress = {
  vehicleId: string | null
  startReadingId: string | null
  endReadingId: string | null
  tripId: string | null
  startPhotoPath: string | null
  endPhotoPath: string | null
}

export type TripCloseProgress = {
  vehicleId: string | null
  endReadingId: string | null
  endPhotoPath: string | null
}

export const freshTripOpenProgress = (): TripOpenProgress => ({
  vehicleId: null,
  startReadingId: null,
  endReadingId: null,
  tripId: null,
  startPhotoPath: null,
  endPhotoPath: null,
})

export const freshTripCloseProgress = (): TripCloseProgress => ({
  vehicleId: null,
  endReadingId: null,
  endPhotoPath: null,
})

async function resolveVehicleId(current: string | null): Promise<string> {
  if (current) return current
  // Pas de véhicule figé à la mise en file : le choix du navigateur qui
  // synchronise (D44) — la base ne porte plus de véhicule « actif ».
  const selected = pickSelectedVehicle(await vehiclesRepository.listVehicles())
  if (!selected) {
    throw new DataError(
      'not_found',
      'Aucun véhicule dans la flotte — prévenez l\u2019administrateur.',
    )
  }
  return selected.id
}

/**
 * Photo d'une extrémité : upload (jamais deux fois — le marqueur est posé
 * entre l'envoi des octets et leur collage, reprise du patron M7), puis
 * attach, idempotent.
 */
async function syncEndpointPhoto(
  userId: string,
  readingId: string,
  photo: Blob | null,
  getPath: () => string | null,
  setPath: (path: string) => Promise<void>,
): Promise<void> {
  if (!photo) return
  let path = getPath()
  if (!path) {
    path = await photosRepository.uploadPhoto(userId, readingId, photo)
    await setPath(path)
  }
  await kilometersRepository.attachPhoto(readingId, path)
}

/**
 * Ouvrir une sortie (D31/D35) : relevés puis ligne `trips` (ordre qui respecte
 * UNIQUE et D34, cf. tripsRepository.openTrip), photos collées après — leur
 * échec ne défait pas la sortie (esprit D25). `mark` persiste l'état complet à
 * chaque étape réussie.
 */
export async function syncTripOpen(
  input: {
    vehicleId: string | null
    userId: string
    start: TripEndpointData
    end: TripEndpointData | null
  },
  progress: TripOpenProgress,
  mark: (progress: TripOpenProgress) => Promise<void>,
): Promise<void> {
  if (!progress.tripId) {
    progress.vehicleId = await resolveVehicleId(
      input.vehicleId ?? progress.vehicleId,
    )
    await tripsRepository.openTrip(
      {
        vehicleId: progress.vehicleId,
        userId: input.userId,
        start: strip(input.start),
        end: input.end ? strip(input.end) : null,
        resume: {
          startReadingId: progress.startReadingId,
          endReadingId: progress.endReadingId,
        },
      },
      async (p) => {
        progress.startReadingId = p.startReadingId
        progress.endReadingId = p.endReadingId
        progress.tripId = p.tripId
        await mark(progress)
      },
    )
    if (!progress.tripId) await mark(progress)
  }
  if (input.start.photo && progress.startReadingId) {
    await syncEndpointPhoto(
      input.userId,
      progress.startReadingId,
      input.start.photo,
      () => progress.startPhotoPath,
      async (path) => {
        progress.startPhotoPath = path
        await mark(progress)
      },
    )
  }
  if (input.end?.photo && progress.endReadingId) {
    await syncEndpointPhoto(
      input.userId,
      progress.endReadingId,
      input.end.photo,
      () => progress.endPhotoPath,
      async (path) => {
        progress.endPhotoPath = path
        await mark(progress)
      },
    )
  }
}

/**
 * Clôturer une sortie (D34) : relevé d'arrivée (sous D6, comme toute
 * insertion), photo, puis UPDATE `trips` — idempotent au rejeu à l'identique
 * (trigger M9). Le véhicule du relevé d'arrivée est celui résolu à l'envoi
 * (choix du navigateur qui synchronise, D44) : en cas de divergence avec le
 * véhicule de la sortie (deux navigateurs sur deux véhicules), c'est le
 * trigger qui tranche.
 */
export async function syncTripClose(
  input: {
    targetTripId: string
    vehicleId: string | null
    userId: string
    end: TripEndpointData
  },
  progress: TripCloseProgress,
  mark: (progress: TripCloseProgress) => Promise<void>,
): Promise<void> {
  progress.vehicleId = await resolveVehicleId(
    input.vehicleId ?? progress.vehicleId,
  )
  if (!progress.endReadingId) {
    const reading = await kilometersRepository.insertReading({
      vehicleId: progress.vehicleId,
      userId: input.userId,
      km: input.end.km,
      readingAt: input.end.readingAt,
      fuelPercent: input.end.fuelPercent,
      notes: input.end.notes,
    })
    progress.endReadingId = reading.id
    await mark(progress)
  }
  await syncEndpointPhoto(
    input.userId,
    progress.endReadingId,
    input.end.photo,
    () => progress.endPhotoPath,
    async (path) => {
      progress.endPhotoPath = path
      await mark(progress)
    },
  )
  await tripsRepository.closeTrip(input.targetTripId, progress.endReadingId)
}

/** Annuler une sortie en cours (D36) : un seul UPDATE, le trigger miroir est
 * idempotent au rejeu (notes M9). */
export async function syncTripCancel(tripId: string): Promise<void> {
  await tripsRepository.cancelTrip(tripId)
}

function strip(endpoint: TripEndpointData): tripsRepository.NewReadingPoint {
  return {
    km: endpoint.km,
    readingAt: endpoint.readingAt,
    fuelPercent: endpoint.fuelPercent,
    notes: endpoint.notes,
  }
}
