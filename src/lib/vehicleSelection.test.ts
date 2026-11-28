// @vitest-environment jsdom
// D44 figé par le test : la sélection du véhicule est un choix PAR
// NAVIGATEUR, persisté en localStorage — jamais en base. Le stockage ne
// sert que d'indice : la résolution confronte toujours l'id mémorisé à la
// flotte réelle, et un choix obsolète (véhicule retiré) retombe sur le
// premier de liste (le véhicule réel du seed).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pickSelectedVehicle,
  readVehicleSelection,
  saveVehicleSelection,
  subscribeVehicleSelection,
} from '@/lib/vehicleSelection'

const fleet = [{ id: 'a' }, { id: 'b' }]

beforeEach(() => {
  localStorage.clear()
})

describe('vehicleSelection (D44)', () => {
  it('persiste le choix dans CE navigateur et le relit', () => {
    expect(readVehicleSelection()).toBeNull()
    saveVehicleSelection('b')
    expect(readVehicleSelection()).toBe('b')
    expect(localStorage.getItem('lavoiturea-jojo:vehicle-id')).toBe('b')
  })

  it('pick : choix mémorisé retrouvé dans la flotte', () => {
    saveVehicleSelection('b')
    expect(pickSelectedVehicle(fleet)).toEqual({ id: 'b' })
  })

  it('pick : sans choix mémorisé, premier véhicule de la flotte', () => {
    expect(pickSelectedVehicle(fleet)).toEqual({ id: 'a' })
  })

  it('pick : choix mémorisé hors flotte retombe sur le premier', () => {
    saveVehicleSelection('fantôme')
    expect(pickSelectedVehicle(fleet)).toEqual({ id: 'a' })
  })

  it('pick : flotte vide ⇒ null', () => {
    expect(pickSelectedVehicle([])).toBeNull()
  })

  it('save : avertit les souscripteurs, désabonnement respecté', () => {
    const heard = vi.fn()
    const unsubscribe = subscribeVehicleSelection(heard)
    saveVehicleSelection('a')
    expect(heard).toHaveBeenCalledWith('a')
    unsubscribe()
    saveVehicleSelection('b')
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
