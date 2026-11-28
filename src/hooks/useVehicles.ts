// Hook du tableau de bord admin (D8, milestone 6) : flotte et édition des
// infos. Depuis D44, la bascule du véhicule « actif » a disparu : le véhicule
// courant est le choix de chaque navigateur (useActiveVehicle.selectVehicle),
// rien d'admin à ce niveau. Après action, la liste est rechargée depuis la
// base — la flotte y reste la seule vérité.
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

  /** Édition marque / modèle / plaque (D8) : seule écriture admin dans vehicles. */
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
    saveVehicleInfo,
    reload: fetchAndApply,
  }
}
