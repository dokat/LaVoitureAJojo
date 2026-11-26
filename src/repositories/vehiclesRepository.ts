// Vehicles : flotte = véhicule réel + véhicule de dev, un seul actif (D2/D3).
// Lecture pour tous ; bascule d'activation et édition des infos sont admin
// (D8, milestone 6) — la policy RLS « vehicules editables par admin » garde
// la vérité. La conversion des lignes est la compétence du schéma zod (D26).
import { supabase } from '@/lib/supabase'
import { toDataError } from '@/repositories/errors'
import {
  vehicleRowSchema,
  type Vehicle,
  type VehicleRowInput,
} from '@/schemas/vehicles'

// Le paramètre est la forme attendue par le schéma : si une colonne disparaît
// ou change de type côté base (type généré D24), le mapping refuse de compiler.
function toVehicle(row: VehicleRowInput): Vehicle {
  return vehicleRowSchema.parse(row)
}

/** Tous les véhicules (l'admin verra les deux, le membre n'utilise que la bascule). */
export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, brand, model, plate, is_active')
    .order('created_at')
  if (error) throw toDataError(error)
  return (data ?? []).map(toVehicle)
}

/** Le véhicule actif, source de toute la chronologie (index partiel D3). */
export async function getActiveVehicle(): Promise<Vehicle | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, brand, model, plate, is_active')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw toDataError(error)
  return data ? toVehicle(data) : null
}

/**
 * Bascule du véhicule actif (D8, admin). Deux écritures séquentielles :
 * désactiver les autres d'abord — l'index partiel unique
 * vehicles_one_active_at_a_time interdirait d'activer la cible tant qu'un
 * autre est actif. Fenêtre « aucun actif » de quelques millisecondes entre
 * les deux : sans impact à l'échelle D1, le trigger SQL garde la cohérence.
 * Retourne la flotte rechargée pour que l'UI affiche l'état de la base.
 */
export async function setActiveVehicle(vehicleId: string): Promise<Vehicle[]> {
  const { error: deactivate } = await supabase
    .from('vehicles')
    .update({ is_active: false })
    .neq('id', vehicleId)
    .eq('is_active', true)
  if (deactivate) throw toDataError(deactivate)
  const { error: activate } = await supabase
    .from('vehicles')
    .update({ is_active: true })
    .eq('id', vehicleId)
  if (activate) throw toDataError(activate)
  return listVehicles()
}

/** Édition des infos d'un véhicule (D8, admin) : marque, modèle, plaque. */
export async function updateVehicleInfo(
  vehicleId: string,
  info: { brand: string; model: string; plate: string },
): Promise<Vehicle> {
  const { data, error } = await supabase
    .from('vehicles')
    .update({ brand: info.brand, model: info.model, plate: info.plate })
    .eq('id', vehicleId)
    .select('id, brand, model, plate, is_active')
    .single()
  if (error) throw toDataError(error)
  return toVehicle(data)
}
