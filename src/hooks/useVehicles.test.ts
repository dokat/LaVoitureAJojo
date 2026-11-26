// @vitest-environment jsdom
// Orchestration du hook admin flotte (M6) : bascule = relecture de la liste
// renvoyée par la base (invariant « un seul actif » gardé là-bas), erreur de
// bascule → relecture pour repartir de l'état réel, sauvegarde d'infos =
// remplacement local de la ligne. Repositories mockés à leur frontière (D23).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  listVehicles: vi.fn(),
  setActiveVehicle: vi.fn(),
  updateVehicleInfo: vi.fn(),
}))

vi.mock('@/repositories/vehiclesRepository', () => ({
  listVehicles: mocks.listVehicles,
  setActiveVehicle: mocks.setActiveVehicle,
  updateVehicleInfo: mocks.updateVehicleInfo,
  getActiveVehicle: vi.fn(),
}))

import { DataError } from '@/repositories/errors'
import type { Vehicle } from '@/schemas/vehicles'
import { useVehicles } from '@/hooks/useVehicles'

const honda: Vehicle = {
  id: 'veh-honda',
  brand: 'Honda',
  model: 'Insight',
  plate: 'AA876RE',
  isActive: true,
}
const dev: Vehicle = {
  id: 'veh-dev',
  brand: 'Dev',
  model: 'Véhicule de test',
  plate: 'DEV-000',
  isActive: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listVehicles.mockResolvedValue([honda, dev])
})

async function mounted() {
  const view = renderHook(() => useVehicles())
  await waitFor(() => expect(view.result.current.status).toBe('ready'))
  return view
}

describe('useVehicles', () => {
  it('charge la flotte au montage', async () => {
    const { result } = await mounted()
    expect(mocks.listVehicles).toHaveBeenCalledTimes(1)
    expect(result.current.vehicles).toEqual([honda, dev])
  })

  it('bascule : la liste renvoyée par la base remplace l état local', async () => {
    const { result } = await mounted()
    const flipped = [
      { ...honda, isActive: false },
      { ...dev, isActive: true },
    ]
    mocks.setActiveVehicle.mockResolvedValue(flipped)

    const error = await act(async () =>
      result.current.activateVehicle('veh-dev'),
    )
    expect(error).toBeNull()
    expect(mocks.setActiveVehicle).toHaveBeenCalledWith('veh-dev')
    expect(result.current.vehicles).toEqual(flipped)
  })

  it('bascule en échec : relecture de la base, erreur typée remontée', async () => {
    const { result } = await mounted()
    mocks.setActiveVehicle.mockRejectedValue(
      new DataError('permission', 'Action non autorisée.'),
    )
    const after = [{ ...honda, isActive: true }]
    mocks.listVehicles.mockResolvedValue(after)

    const error = await act(async () =>
      result.current.activateVehicle('veh-dev'),
    )
    expect(error).toMatchObject({ code: 'permission' })
    // L'état affiché revient à ce que dit la base, pas à un optimisme.
    await waitFor(() => expect(result.current.vehicles).toEqual(after))
  })

  it('édition d infos : la ligne est remplacée par le retour de la base', async () => {
    const { result } = await mounted()
    const fixed = { ...dev, brand: 'Dev', model: 'Bac à sable' }
    mocks.updateVehicleInfo.mockResolvedValue(fixed)

    const error = await act(async () =>
      result.current.saveVehicleInfo('veh-dev', {
        brand: 'Dev',
        model: 'Bac à sable',
        plate: 'DEV-000',
      }),
    )
    expect(error).toBeNull()
    expect(mocks.updateVehicleInfo).toHaveBeenCalledWith('veh-dev', {
      brand: 'Dev',
      model: 'Bac à sable',
      plate: 'DEV-000',
    })
    expect(result.current.vehicles).toEqual([honda, fixed])
  })
})
