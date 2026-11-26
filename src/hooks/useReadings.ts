// Hook du flux relevés : lecture de la chronologie du véhicule actif (avec
// filtres admin M6 : suppressions incluses, par utilisateur), ajout (avec
// photo compressée puis uploadée), soft-delete et restauration. Orchestration
// seule — les règles vivent dans les repositories (base) et validateOdometer
// (UX).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { OdometerPoint } from '@/hooks/useOdometerValidation'
import { compressPhoto, ImageError } from '@/lib/images'
import * as kilometersRepository from '@/repositories/kilometersRepository'
import * as photosRepository from '@/repositories/photosRepository'
import * as vehiclesRepository from '@/repositories/vehiclesRepository'
import { DataError, toDataError } from '@/repositories/errors'
import type { Reading } from '@/schemas/kilometers'
import type { Vehicle } from '@/schemas/vehicles'

export type ReadingsStatus = 'loading' | 'ready' | 'error'

export type UseReadingsOptions = {
  /** Toggle admin « voir les suppressions » (D7, milestone 6). */
  includeDeleted?: boolean
  /** Filtre « par utilisateur » admin (D8, milestone 6). */
  userId?: string | null
}

export type AddReadingInput = {
  km: number
  /** Date de la manipulation (D14) — pré-remplie « maintenant » par le form. */
  readingAt: Date
  fuelPercent?: number | null
  notes?: string | null
  /** Fichier brut du formulaire ; compressé ici avant upload (D16). */
  photo?: Blob | null
}

export type AddReadingResult =
  | { ok: true; reading: Reading; photoError?: DataError }
  | { ok: false; error: DataError }

/** ImageError (pré-traitement local) et erreurs base convergent vers DataError. */
function describe(error: unknown): DataError {
  if (error instanceof ImageError) {
    return new DataError(
      error.code === 'too_large' ? 'photo_upload' : 'unknown',
      error.message,
      error,
    )
  }
  return toDataError(error)
}

export function useReadings(options: UseReadingsOptions = {}) {
  const { includeDeleted = false, userId = null } = options
  const { user } = useAuth()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [readings, setReadings] = useState<Reading[]>([])
  const [status, setStatus] = useState<ReadingsStatus>('loading')
  const [error, setError] = useState<DataError | null>(null)

  // Cœur de lecture : aucun setState synchrone avant un await — le montage
  // passe par lui sans déclencher de rendu en cascade (règle lint react).
  // Les filtres (admin, M6) sont des primitifs : changer l'un relance la
  // lecture, sans dépendre de l'identité de l'objet d'options.
  const fetchAndApply = useCallback(async (): Promise<DataError | null> => {
    try {
      const active = await vehiclesRepository.getActiveVehicle()
      if (!active) {
        throw new DataError(
          'not_found',
          'Aucun véhicule actif — l\u2019administrateur doit en activer un.',
        )
      }
      const list = await kilometersRepository.listReadings(active.id, {
        includeDeleted,
        userId: userId ?? undefined,
      })
      setReadings(list)
      setVehicle(active)
      setError(null)
      setStatus('ready')
      return null
    } catch (caught) {
      const failure = describe(caught)
      setError(failure)
      setStatus('error')
      return failure
    }
  }, [includeDeleted, userId])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- setState après await uniquement (fetch de montage, pas de lib de données)
    void fetchAndApply()
  }, [fetchAndApply])

  // Rechargement déclenché depuis un événement (bouton « réessayer ») :
  // repasse par l'état « loading », cette fois depuis le handler, pas l'effet.
  const reload = useCallback(async (): Promise<DataError | null> => {
    setStatus('loading')
    return fetchAndApply()
  }, [fetchAndApply])

  const addReading = useCallback(
    async (input: AddReadingInput): Promise<AddReadingResult> => {
      if (!user || !vehicle) {
        return {
          ok: false,
          error: new DataError(
            'not_found',
            'Session ou véhicule indisponible — rechargez la page.',
          ),
        }
      }
      try {
        const photo = input.photo ? await compressPhoto(input.photo) : null
        const reading = await kilometersRepository.insertReading({
          vehicleId: vehicle.id,
          userId: user.id,
          km: input.km,
          readingAt: input.readingAt,
          fuelPercent: input.fuelPercent ?? null,
          notes: input.notes ?? null,
        })
        if (photo) {
          // L'insertion a réussi : le relevé existe, même si les octets de la
          // photo ne partent pas. Rien n'est perdu silencieusement (esprit
          // D7/D13) : le résultat porte photoError, la liste se rafraîchira.
          try {
            const path = await photosRepository.uploadPhoto(
              user.id,
              reading.id,
              photo.blob,
            )
            await kilometersRepository.attachPhoto(reading.id, path)
            reading.photoPath = path
          } catch (caught) {
            await fetchAndApply()
            return {
              ok: true,
              reading,
              photoError: describe(caught),
            }
          }
        }
        await fetchAndApply()
        return { ok: true, reading }
      } catch (caught) {
        return { ok: false, error: describe(caught) }
      }
    },
    [user, vehicle, fetchAndApply],
  )

  /**
   * Soft-delete (D7) : la ligne reste en base. Invisible par défaut, elle est
   * retirée de la liste ; avec le toggle admin « voir les suppressions », elle
   * y reste marquée supprimée (l'UI affiche alors le bouton restaurer).
   */
  const softDelete = useCallback(
    async (readingId: string): Promise<DataError | null> => {
      if (!user) {
        return new DataError('not_found', 'Session indisponible — rechargez.')
      }
      try {
        await kilometersRepository.softDeleteReading(readingId, user.id)
        setReadings((current) =>
          includeDeleted
            ? current.map((r) =>
                r.id === readingId
                  ? { ...r, deletedAt: new Date(), deletedBy: user.id }
                  : r,
              )
            : current.filter((r) => r.id !== readingId),
        )
        return null
      } catch (caught) {
        return describe(caught)
      }
    },
    [user, includeDeleted],
  )

  /**
   * Restauration (D7, admin) : relecture depuis la base après coup — en cas
   * de refus D6 (D18), c'est la chronologie réelle qu'il faut afficher, pas
   * un état optimiste. Retourne null si OK, l'erreur typée sinon.
   */
  const restore = useCallback(
    async (readingId: string): Promise<DataError | null> => {
      try {
        await kilometersRepository.restoreReading(readingId)
        await fetchAndApply()
        return null
      } catch (caught) {
        return describe(caught)
      }
    },
    [fetchAndApply],
  )

  /**
   * Point d'appui D6 : premier relevé VIVANT du tri de récence. Avec le
   * toggle admin, readings peut porter des lignes mortes : elles ne comptent
   * pas (la chronologie vue par la base est celle des vivants).
   */
  const lastReading = useMemo<OdometerPoint | null>(() => {
    const latest = readings.find((r) => r.deletedAt === null) ?? null
    return latest ? { km: latest.km, readingAt: latest.readingAt } : null
  }, [readings])

  return {
    status,
    error,
    vehicle,
    readings,
    lastReading,
    addReading,
    softDelete,
    restore,
    reload,
  }
}
