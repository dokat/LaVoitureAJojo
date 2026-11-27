// Trips : la couche de liaison du modèle « sortie » (D30). Une sortie n'existe
// que par ses deux relevés — ce module écrit `trips` et, pour openTrip,
// orchestre l'insertion des relevés DANS L'ORDRE qui respecte les contraintes :
// départ, puis arrivée, puis ligne trips (le trigger de relais D35 et
// l'assertion D34 à l'insertion ne peuvent échouer qu'après des relevés valides,
// et le rejeu hors-ligne (D39) ne réinsère jamais un relevé déjà posé).
// Annulation et levée sont UN seul UPDATE sur trips : le trigger M9 entretient
// le soft-delete du départ en miroir (D36, notes M9). Suppression d'une sortie
// clôturée = deux soft-deletes de relevés, JAMAIS d'écriture sur trips (D33).
import { supabase } from '@/lib/supabase'
import { TripError, toDataError } from '@/repositories/errors'
import * as kilometersRepository from '@/repositories/kilometersRepository'
import { tripRowSchema, type Trip, type TripRowInput } from '@/schemas/trips'
import type { Reading } from '@/schemas/kilometers'

// Le paramètre est la forme attendue par le schéma : si une colonne disparaît
// ou change de type côté base (type généré D24), le mapping refuse de compiler.
function toTrip(row: TripRowInput): Trip {
  return tripRowSchema.parse(row)
}

/** Historique des sorties d'un véhicule, de la plus récente à la plus ancienne. */
export async function fetchTrips(vehicleId: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false })
  if (error) throw toDataError(error)
  return (data ?? []).map(toTrip)
}

/** Reconnaissance du rejeu (D39) : la ligne existe déjà si l'UNIQUE (D30) sonne. */
export async function getTripByStartReading(
  startReadingId: string,
): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('start_reading_id', startReadingId)
    .maybeSingle()
  if (error) throw toDataError(error)
  return data ? toTrip(data) : null
}

export type NewReadingPoint = {
  km: number
  /** Date de la manipulation (D14), pas maintenant SQL. */
  readingAt: Date
  fuelPercent?: number | null
  notes?: string | null
}

export type NewTrip = {
  vehicleId: string
  userId: string
  start: NewReadingPoint
  /** Rétro-saisie (D31) : présente ⇒ la sortie naît clôturée. */
  end?: NewReadingPoint | null
  /** Reprise d'un envoi coupé (D39) : id déjà insérés ⇒ on ne réinsère pas. */
  resume?: { startReadingId?: string | null; endReadingId?: string | null }
}

/** Avancement d'une ouverture, exposé pas à pas pour la reprise hors-ligne. */
export type TripWriteProgress = {
  startReadingId: string | null
  endReadingId: string | null
  tripId: string | null
}

/**
 * Ouvrir une sortie : insert du relevé de départ (le trigger D6 garde la
 * chronologie), insert de l'arrivée si rétro-saisie, puis ligne `trips` — le
 * trigger de relais (D35) clôt automatiquement la sortie en cours avec le
 * MÊME relevé de départ, ou refuse typé (TRIP_RELAY_CONFLICT). `onProgress`
 * est appelé après chaque écriture réussie pour que l'appelant persiste ses
 * marqueurs de reprise (D29/D39 : jamais de doublon).
 */
export async function openTrip(
  input: NewTrip,
  onProgress?: (progress: TripWriteProgress) => Promise<void> | void,
): Promise<Trip> {
  const report = async (progress: TripWriteProgress): Promise<void> => {
    await onProgress?.(progress)
  }
  let startReadingId = input.resume?.startReadingId ?? null
  let endReadingId = input.resume?.endReadingId ?? null
  if (!startReadingId) {
    startReadingId = (await insertEndpointReading(input, input.start)).id
    await report({ startReadingId, endReadingId, tripId: null })
  }
  if (input.end && !endReadingId) {
    endReadingId = (await insertEndpointReading(input, input.end)).id
    await report({ startReadingId, endReadingId, tripId: null })
  }
  const trip = await insertTripRow({
    vehicleId: input.vehicleId,
    startReadingId,
    endReadingId,
  })
  await report({ startReadingId, endReadingId, tripId: trip.id })
  return trip
}

/** Insertion d'un relevé d'extrémité (départ ou arrivée) : mêmes colonnes que
 * la saisie unitaire, le trigger D6 s'applique donc de façon identique. */
function insertEndpointReading(
  input: NewTrip,
  point: NewReadingPoint,
): Promise<Reading> {
  return kilometersRepository.insertReading({
    vehicleId: input.vehicleId,
    userId: input.userId,
    km: point.km,
    readingAt: point.readingAt,
    fuelPercent: point.fuelPercent ?? null,
    notes: point.notes ?? null,
  })
}

/**
 * Ligne `trips` seule — le pas terminal de l'ouverture, là où le trigger de
 * relais (D35) s'applique. Idempotence du rejeu (D39) : un UNIQUE sur
 * `start_reading_id` qui sonne signifie « cette ouverture est déjà passée »,
 * on retrouve la ligne plutôt que de replonger en erreur.
 */
export async function insertTripRow(input: {
  vehicleId: string
  startReadingId: string
  endReadingId?: string | null
}): Promise<Trip> {
  try {
    const { data, error } = await supabase
      .from('trips')
      .insert({
        vehicle_id: input.vehicleId,
        start_reading_id: input.startReadingId,
        end_reading_id: input.endReadingId ?? null,
      })
      .select('*')
      .single()
    if (error) throw toDataError(error)
    return toTrip(data)
  } catch (caught) {
    if (caught instanceof TripError && caught.code === 'trip_already_open') {
      const existing = await getTripByStartReading(input.startReadingId)
      if (existing) return existing
    }
    throw caught
  }
}

/**
 * Clôturer (D34) : poser `end_reading_id` — le trigger vérifie km et dates
 * dans les deux sens. Le rejeu à l'identique est un no-op côté trigger
 * (D39), donc cette écriture est naturellement idempotente.
 */
export async function closeTrip(
  tripId: string,
  endReadingId: string,
): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .update({ end_reading_id: endReadingId })
    .eq('id', tripId)
    .select('*')
    .single()
  if (error) throw toDataError(error)
  return toTrip(data)
}

/**
 * Annuler une sortie en cours (D36) : UN UPDATE — le trigger soft-delete le
 * relevé de départ dans la foulée (notes M9). Idempotent au rejeu.
 */
export async function cancelTrip(tripId: string): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', tripId)
    .select('*')
    .single()
  if (error) throw toDataError(error)
  return toTrip(data)
}

/**
 * Levée d'annulation (D36/D37, admin) : UN UPDATE — le trigger restaure le
 * départ sous le recontrôle D18 (TRIP_ADMIN_ONLY / KM_REGRESSION possibles).
 */
export async function liftTripCancellation(tripId: string): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .update({ cancelled_at: null })
    .eq('id', tripId)
    .select('*')
    .single()
  if (error) throw toDataError(error)
  return toTrip(data)
}

/**
 * Supprimer une sortie clôturée (D33) : contagion par les relevés — deux
 * soft-deletes (`deleted_by` = l'exécutant), aucune écriture sur `trips`.
 * Une sortie en cours ne se supprime pas, elle s'annule (garde d'usage).
 */
export async function deleteTrip(trip: Trip, deletedBy: string): Promise<void> {
  if (trip.endReadingId === null && trip.cancelledAt === null) {
    throw new TripError(
      'trip_immutable',
      'Une sortie en cours s\u2019annule, elle ne se supprime pas (D33).',
    )
  }
  await kilometersRepository.softDeleteReading(trip.startReadingId, deletedBy)
  if (trip.endReadingId) {
    await kilometersRepository.softDeleteReading(trip.endReadingId, deletedBy)
  }
}

/**
 * Restauration par agrégat (D37) — la branche dépend de la cause de la mort :
 * - sortie ANNULÉE : un seul UPDATE sur trips (levée), le trigger restaure le
 *   départ sous D18 (notes M9 : « pas trois écritures ») ;
 * - sortie SUPPRIMÉE : les relevés d'abord (départ puis arrivée, chacun sous
 *   le recontrôle D18 → KM_REGRESSION possible), la ligne `trips` n'ayant
 *   jamais bougé (contagion D33).
 */
export async function restoreTrip(trip: Trip): Promise<Trip> {
  if (trip.cancelledAt) return liftTripCancellation(trip.id)
  await kilometersRepository.restoreReading(trip.startReadingId)
  if (trip.endReadingId) {
    await kilometersRepository.restoreReading(trip.endReadingId)
  }
  return trip
}

/** Sortie en cours (D35 au plus une par véhicule) ou null. */
export function findOpenTrip(trips: Trip[]): Trip | null {
  return (
    trips.find(
      (trip) => trip.endReadingId === null && trip.cancelledAt === null,
    ) ?? null
  )
}
