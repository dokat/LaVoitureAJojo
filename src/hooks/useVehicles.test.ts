// @vitest-environment jsdom
// Orchestration du hook admin flotte (M6, amendé D44) : lecture de la flotte,
// sauvegarde d'infos = remplacement local de la ligne par le retour de la
// base. La bascule d'activation n'existe plus : le véhicule courant est un
// choix par navigateur (lib/vehicleSelection), sans écriture base.
// Repositories mockés à leur frontière (D23).
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

import type { Vehicle } from '@/schemas/vehicles'
import { useVehicles } from '@/hooks/useVehicles'

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
