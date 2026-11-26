// Kilometers : l'agrégat central (D5/D6/D7). Les règles sont gardées en base
// par les triggers ; ce module ne fait que les traduire en DataError typées.
// La forme des lignes est la compétence du schéma zod (D26) : parse = contrôle
// de forme + conversion snake → camel et ISO → Date en un seul endroit.
// Pas d'update de km/reading_at/vehicle_id/user_id : le trigger
// kilometers_immutable (D19) les interdit — corriger = soft-delete + ré-insertion.
import { supabase } from '@/lib/supabase'
import { toDataError } from '@/repositories/errors'
import {
  readingRowSchema,
  type Reading,
  type ReadingRowInput,
} from '@/schemas/kilometers'

// Le paramètre est la forme attendue par le schéma : si une colonne disparaît
// ou change de type côté base (type généré D24), le mapping refuse de compiler.
function toReading(row: ReadingRowInput): Reading {
  return readingRowSchema.parse(row)
}

export type ReadingFilters = {
  /** Toggle admin « voir les suppressions » (D7, milestone 6). */
  includeDeleted?: boolean
  /** Filtre « par utilisateur » admin (D8, milestone 6). */
  userId?: string
}

/** Historique d'un véhicule, du plus récent au plus ancien (vivants par défaut). */
export async function listReadings(
  vehicleId: string,
  filters: ReadingFilters = {},
): Promise<Reading[]> {
  let query = supabase
    .from('kilometers')
    .select('*')
    .eq('vehicle_id', vehicleId)
  if (!filters.includeDeleted) query = query.is('deleted_at', null)
  if (filters.userId) query = query.eq('user_id', filters.userId)
  // Tri de « récence » : celui du trigger D6, aligné sur l'index
  // kilometers_vehicle_reading_active.
  const { data, error } = await query
    .order('reading_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw toDataError(error)
  return (data ?? []).map(toReading)
}

/** Dernier relevé vivant du véhicule : le point d'appui de la règle D6. */
export async function getLatestReading(
  vehicleId: string,
): Promise<Reading | null> {
  const { data, error } = await supabase
    .from('kilometers')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .is('deleted_at', null)
    .order('reading_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw toDataError(error)
  return data ? toReading(data) : null
}

export type NewReading = {
  vehicleId: string
  userId: string
  km: number
  /** Date de la manipulation utilisateur (D14), pas maintenant SQL. */
  readingAt: Date
  fuelPercent?: number | null
  notes?: string | null
}

/** Insertion ; le trigger D6 peut lever KM_REGRESSION → DataError typée. */
export async function insertReading(input: NewReading): Promise<Reading> {
  const { data, error } = await supabase
    .from('kilometers')
    .insert({
      vehicle_id: input.vehicleId,
      user_id: input.userId,
      km: input.km,
      reading_at: input.readingAt.toISOString(),
      fuel_percent: input.fuelPercent ?? null,
      notes: input.notes ?? null,
    })
    .select('*')
    .single()
  if (error) throw toDataError(error)
  return toReading(data)
}

/** Complément par l'auteur : le chemin de la photo uploadée (D16/D19). */
export async function attachPhoto(
  readingId: string,
  photoPath: string,
): Promise<void> {
  const { error } = await supabase
    .from('kilometers')
    .update({ photo_path: photoPath })
    .eq('id', readingId)
  if (error) throw toDataError(error)
}

/**
 * Soft-delete (D7) : `deleted_by` est imposé par la policy RLS auteur.
 * Le trigger D6 ne bloque jamais une suppression douce (D18).
 */
export async function softDeleteReading(
  readingId: string,
  deletedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('kilometers')
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
    .eq('id', readingId)
  if (error) throw toDataError(error)
}
