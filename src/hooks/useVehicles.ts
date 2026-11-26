// Hook du tableau de bord admin (D8, milestone 6) : flotte, bascule du
// véhicule actif et édition des infos. La bascule est une fenêtre de vérité
// locale : après chaque action, la liste est rechargée depuis la base (un
// seul actif est un invariant gardé là-bas, index partiel D3).
import { useCallback, useEffect, useState } from 'react'
import * as vehiclesRepository from '@/repositories/vehiclesRepository'
import { DataError, toDataError } from '@/repositories/errors'
import type { Vehicle } from '@/schemas/vehicles'

export type VehiclesStatus = 'loading' | 'ready' | 'error'

export type VehicleInfo = { brand: string; model: string; plate: string }

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [status, setStatus] = useState<VehiclesStatus>('loading')
  const [error, setError] = useState<DataError | null>(null)

  const fetchAndApply = useCallback(async (): Promise<DataError | null> => {
    try {
      setVehicles(await vehiclesRepository.listVehicles())
      setError(null)
      setStatus('ready')
      return null
    } catch (caught) {
      setError(toDataError(caught))
      setStatus('error')
      return toDataError(caught)
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- setState après await uniquement (fetch de montage, pas de lib de données)
    void fetchAndApply()
  }, [fetchAndApply])

  /** Bascule admin du véhicule actif (seule à pouvoir écrire dans vehicles). */
  const activateVehicle = useCallback(
    async (vehicleId: string): Promise<DataError | null> => {
      try {
        setVehicles(await vehiclesRepository.setActiveVehicle(vehicleId))
        return null
      } catch (caught) {
        // État inconnu (la bascule est séquentielle) : on relit la base.
        await fetchAndApply()
        return toDataError(caught)
      }
    },
    [fetchAndApply],
  )

  /** Édition marque / modèle / plaque (D8). */
  const saveVehicleInfo = useCallback(
    async (vehicleId: string, info: VehicleInfo): Promise<DataError | null> => {
      try {
        const updated = await vehiclesRepository.updateVehicleInfo(
          vehicleId,
          info,
        )
        setVehicles((current) =>
          current.map((v) => (v.id === vehicleId ? updated : v)),
        )
        return null
      } catch (caught) {
        return toDataError(caught)
      }
    },
    [],
  )

  return {
    status,
    error,
    vehicles,
    activateVehicle,
    saveVehicleInfo,
    reload: fetchAndApply,
  }
}
