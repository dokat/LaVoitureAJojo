// Vehicles : flotte = véhicule réel + véhicule de dev (D2/D3). Lecture pour
// tous ; édition des infos admin (D8, milestone 6) — la policy RLS
// « vehicules editables par admin » garde la vérité. Depuis D44, plus aucune
// notion de véhicule « actif » ici : le véhicule courant est un choix par
// navigateur (lib/vehicleSelection), rien n'est écrit en base pour ça. La
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

/** Toute la flotte, dans l'ordre de création (le véhicule réel du seed d'abord). */
export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, brand, model, plate')
    .order('created_at')
  if (error) throw toDataError(error)
  return (data ?? []).map(toVehicle)
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
    .select('id, brand, model, plate')
    .single()
  if (error) throw toDataError(error)
  return toVehicle(data)
}
