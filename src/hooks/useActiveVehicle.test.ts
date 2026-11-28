// @vitest-environment jsdom
// D44 figé par le test : le véhicule courant est le choix du NAVIGATEUR.
// Résolu au montage contre la flotte (choix mémorisé, sinon premier de
// liste), persisté par selectVehicle sans aucune écriture base, et propagé
// à toutes les instances montées — l'app change de véhicule sans
// rechargement. Repository mocké à sa frontière (D23).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  listVehicles: vi.fn(),
  updateVehicleInfo: vi.fn(),
}))

vi.mock('@/repositories/vehiclesRepository', () => ({
  listVehicles: mocks.listVehicles,
  updateVehicleInfo: mocks.updateVehicleInfo,
}))

import { saveVehicleSelection } from '@/lib/vehicleSelection'
import type { Vehicle } from '@/schemas/vehicles'
import { useActiveVehicle } from '@/hooks/useActiveVehicle'

const honda: Vehicle = {
  id: 'veh-honda',
  brand: 'Honda',
  model: 'Insight',
  plate: 'AA876RE',
}
const dev: Vehicle = {
  id: 'veh-dev',
  brand: 'Dev',
  model: 'Véhicule de test',
  plate: 'DEV-000',
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.listVehicles.mockResolvedValue([honda, dev])
})

describe('useActiveVehicle (choix navigateur, D44)', () => {
  it('sans choix mémorisé, retombe sur le premier véhicule (le réel du seed)', async () => {
    const { result } = renderHook(() => useActiveVehicle())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.vehicle).toEqual(honda)
    expect(result.current.fleet).toEqual([honda, dev])
  })

  it('un choix mémorisé ailleurs dans le navigateur est respecté au montage', async () => {
    saveVehicleSelection(dev.id)
    const { result } = renderHook(() => useActiveVehicle())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.vehicle).toEqual(dev)
  })

  it('selectVehicle persiste localement — zéro écriture base', async () => {
    const { result } = renderHook(() => useActiveVehicle())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.selectVehicle(dev.id))
    expect(localStorage.getItem('lavoiturea-jojo:vehicle-id')).toBe(dev.id)
    // listVehicles n'est appelé qu'au montage : selectVehicle n'interpelle
    // ni supabase-js ni le repository.
    expect(mocks.listVehicles).toHaveBeenCalledTimes(1)
  })

  it('le choix change le véhicule de TOUTES les instances montées', async () => {
    const pageA = renderHook(() => useActiveVehicle())
    const pageB = renderHook(() => useActiveVehicle())
    await waitFor(() => expect(pageA.result.current.status).toBe('ready'))
    await waitFor(() => expect(pageB.result.current.status).toBe('ready'))

    act(() => pageA.result.current.selectVehicle(dev.id))

    expect(pageA.result.current.vehicle).toEqual(dev)
    // L'autre écran (ex. l'historique derrière le dashboard) bascule aussi,
    // sans relecture ni rechargement.
    await waitFor(() => expect(pageB.result.current.vehicle).toEqual(dev))
  })

  it('choix mémorisé hors flotte : résolution sur le premier, sans erreur', async () => {
    saveVehicleSelection('véhicule-supprimé')
    const { result } = renderHook(() => useActiveVehicle())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.vehicle).toEqual(honda)
  })

  it('flotte vide : erreur pas_found', async () => {
    mocks.listVehicles.mockResolvedValue([])
    const { result } = renderHook(() => useActiveVehicle())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.code).toBe('not_found')
  })
})
