// Vehicles : flotte = véhicule réel + véhicule de dev, un seul actif (D2/D3).
// La bascule d'activation et l'édition des infos sont admin (D8) et viendront
// avec le milestone 6 ; ici seules les lectures utiles au cœur métier. La
// conversion des lignes est la compétence du schéma zod (D26).
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
