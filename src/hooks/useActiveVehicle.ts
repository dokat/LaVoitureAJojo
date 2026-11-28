// Résolution du véhicule actif pour les écrans qui pilotent des sorties :
// `useTrips` prend un vehicleId en paramètre (M10) et la flotte n'est pas un
// store global — chaque écran relit au montage (patron M5). Une responsabilité
// : savoir quel véhicule est actif, rien d'autre (`useVehicles` reste l'outil
// admin de bascule, D8).
import { useCallback, useEffect, useState } from 'react'
import * as vehiclesRepository from '@/repositories/vehiclesRepository'
import { DataError, toDataError } from '@/repositories/errors'
import type { Vehicle } from '@/schemas/vehicles'

export type ActiveVehicleStatus = 'loading' | 'ready' | 'error'

export function useActiveVehicle() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [status, setStatus] = useState<ActiveVehicleStatus>('loading')
  const [error, setError] = useState<DataError | null>(null)

  const fetchAndApply = useCallback(async (): Promise<DataError | null> => {
    try {
      const active = await vehiclesRepository.getActiveVehicle()
      if (!active) {
        throw new DataError(
          'not_found',
          'Aucun véhicule actif — l\u2019administrateur doit en activer un.',
        )
      }
      setVehicle(active)
      setError(null)
      setStatus('ready')
      return null
    } catch (caught) {
      const failure = toDataError(caught)
      setError(failure)
      setStatus('error')
      return failure
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- setState après await uniquement (fetch de montage, pas de lib de données)
    void fetchAndApply()
  }, [fetchAndApply])

  const reload = useCallback(async (): Promise<DataError | null> => {
    setStatus('loading')
    return fetchAndApply()
  }, [fetchAndApply])

  return { vehicle, status, error, reload }
}
