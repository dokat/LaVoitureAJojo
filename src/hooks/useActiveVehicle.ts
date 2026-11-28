// Résolution du véhicule courant pour les écrans qui pilotent des sorties :
// `useTrips` prend un vehicleId en paramètre (M10) et la flotte n'est pas un
// store global — chaque écran relit au montage (patron M5). Une responsabilité
// : savoir quel véhicule est courant, rien d'autre. Depuis D44, le courant est
// le choix du NAVIGATEUR (lib/vehicleSelection) ; le choix mémorisé disparu de
// la flotte retombe sur le premier véhicule (le réel du seed). `selectVehicle`
// persiste localement et avertit tous les hooks montés — l'app change de
// véhicule sans rechargement, en écho dans les autres écrans et onglets.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as vehiclesRepository from '@/repositories/vehiclesRepository'
import {
  pickSelectedVehicle,
  saveVehicleSelection,
  subscribeVehicleSelection,
} from '@/lib/vehicleSelection'
import { DataError, toDataError } from '@/repositories/errors'
import type { Vehicle } from '@/schemas/vehicles'

export type ActiveVehicleStatus = 'loading' | 'ready' | 'error'

export function useActiveVehicle() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [fleet, setFleet] = useState<Vehicle[]>([])
  const [status, setStatus] = useState<ActiveVehicleStatus>('loading')
  const [error, setError] = useState<DataError | null>(null)
  // Vue miroir de la flotte pour les notifications de choix (la subscription
  // ne doit pas dépendre de l'état React au moment où elle est créée).
  const fleetRef = useRef<Vehicle[]>([])

  const fetchAndApply = useCallback(async (): Promise<DataError | null> => {
    try {
      const list = await vehiclesRepository.listVehicles()
      const selected = pickSelectedVehicle(list)
      if (!selected) {
        throw new DataError(
          'not_found',
          'Aucun véhicule dans la flotte — prévenez l\u2019administrateur.',
        )
      }
      fleetRef.current = list
      setFleet(list)
      setVehicle(selected)
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
    // Le choix a changé (cet onglet via selectVehicle, un autre onglet via
    // « storage ») : on resout contre la flotte déjà chargée, sans relire.
    return subscribeVehicleSelection(() => {
      const selected = pickSelectedVehicle(fleetRef.current)
      if (selected) setVehicle(selected)
    })
  }, [fetchAndApply])

  const reload = useCallback(async (): Promise<DataError | null> => {
    setStatus('loading')
    return fetchAndApply()
  }, [fetchAndApply])

  /** Sélectionne pour CE navigateur uniquement (D44) — aucune écriture base. */
  const selectVehicle = useCallback((vehicleId: string) => {
    saveVehicleSelection(vehicleId)
  }, [])

  return { vehicle, fleet, status, error, selectVehicle, reload }
}
