// Hook des profils : libellés lisibles (email — D27) pour le filtre admin
// « par utilisateur » (D8) et l'auteur affiché dans l'historique. Simple
// lecture, la policy RLS autorise déjà tout authentifié.
import { useCallback, useEffect, useState } from 'react'
import * as profilesRepository from '@/repositories/profilesRepository'
import { DataError, toDataError } from '@/repositories/errors'
import type { Profile } from '@/schemas/profiles'

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [error, setError] = useState<DataError | null>(null)

  const fetchAndApply = useCallback(async (): Promise<void> => {
    try {
      setProfiles(await profilesRepository.listProfiles())
      setError(null)
    } catch (caught) {
      setError(toDataError(caught))
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- setState après await uniquement (fetch de montage, pas de lib de données)
    void fetchAndApply()
  }, [fetchAndApply])

  /** Libellé d'un utilisateur : email si connu, identifiant tronqué sinon. */
  const labelOf = useCallback(
    (userId: string): string => {
      const profile = profiles.find((p) => p.id === userId)
      return profile?.email ?? `utilisateur ${userId.slice(0, 8)}`
    },
    [profiles],
  )

  return { profiles, error, labelOf }
}
