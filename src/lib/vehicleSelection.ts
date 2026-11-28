// Sélection du véhicule courant (D44, 2026-11-28) : un choix PAR NAVIGATEUR,
// persisté en localStorage — jamais en base Supabase. C'est ce qui remplace le
// véhicule « actif » global (vehicles.is_active, amendement D3/D8) : deux
// navigateurs peuvent conduire deux véhicules de la flotte en parallèle.
//
// Ce module parle à localStorage, pas à supabase-js : il vit dans lib/, pas
// dans repositories/ (règle D10, patron pendingStore). La persistance est
// tolérante : en navigation privée/full storage mode, setItem lève — le choix
// reste alors valable pour l'onglet, à défaut d'être revécu au prochain
// montage. La résolution (pickSelectedVehicle) ne fait confiance au stocké que
// s'il désigne un véhicule encore présent dans la flotte.
//
// La souscription garde l'app cohérente quand le choix change : les hooks
// montés de plusieurs écrans (en-tête + pages) réagissent tous ; l'événement
// « storage » couvre les autres onglets du même navigateur.

const STORAGE_KEY = 'lavoiturea-jojo:vehicle-id'

export type VehicleSelectionListener = (vehicleId: string | null) => void

const listeners = new Set<VehicleSelectionListener>()

/** L'id mémorisé dans CE navigateur, ou null (jamais vu / stockage indisponible). */
export function readVehicleSelection(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Mémorise le choix pour CE navigateur et avertit les souscripteurs. */
export function saveVehicleSelection(vehicleId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, vehicleId)
  } catch {
    // Stockage indisponible : le choix n'est pas persisté, mais les auditeurs
    // du présent onglet sont quand même avertis — l'UI reste cohérente ici.
  }
  notify(vehicleId)
}

/**
 * Le véhicule choisi dans la flotte : le choix mémorisé s'il existe toujours,
 * sinon le premier (ordre `created_at`, donc le véhicule réel du seed, D44).
 * Flotte vide ⇒ null — cas de configuration cassée, message porté par
 * l'appelant.
 */
export function pickSelectedVehicle<T extends { id: string }>(
  fleet: readonly T[],
): T | null {
  const stored = readVehicleSelection()
  return fleet.find((vehicle) => vehicle.id === stored) ?? fleet[0] ?? null
}

/** Abonnement aux changements de choix (cet onglet + les autres via « storage »). */
export function subscribeVehicleSelection(
  listener: VehicleSelectionListener,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(vehicleId: string | null): void {
  for (const listener of listeners) listener(vehicleId)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      notify(event.newValue)
    }
  })
}
