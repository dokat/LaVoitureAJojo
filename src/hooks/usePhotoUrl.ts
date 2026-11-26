// URL signée à la demande pour une photo privée (D16) : le chemin storage est
// en base, l'URL est éphémère (10 min). On ne la crée que quand l'UI en a
// besoin (ouverture du visualiseur), jamais au chargement de la liste.
import { useCallback, useState } from 'react'
import { getSignedUrl } from '@/repositories/photosRepository'
import { toDataError, type DataError } from '@/repositories/errors'

export type PhotoUrlStatus = 'idle' | 'loading' | 'ready' | 'error'

export function usePhotoUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<PhotoUrlStatus>('idle')
  const [error, setError] = useState<DataError | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (!path) return
    setStatus('loading')
    try {
      setUrl(await getSignedUrl(path))
      setStatus('ready')
      setError(null)
    } catch (caught) {
      setError(toDataError(caught))
      setStatus('error')
    }
  }, [path])

  return { url, status, error, load }
}
