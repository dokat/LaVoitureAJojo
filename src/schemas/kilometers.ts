// Source de vérité du type Reading (D26) : la ligne `kilometers`, agrégat
// central (D5/D7), transformée en forme domaine. Les règles métier (anti-recul
// D6, immutabilité D19) restent gardées en base par les triggers ; le schéma
// ne valide ici que la FORME de ce qui sort de PostgREST.
import { z } from 'zod'
import { dbTimestamp } from '@/schemas/common'

export const readingRowSchema = z
  .object({
    id: z.uuid(),
    vehicle_id: z.uuid(),
    user_id: z.uuid(),
    km: z.int().min(0), // check SQL `km >= 0`
    fuel_percent: z.int().min(0).max(100).nullable(), // check SQL `between 0 and 100`
    // Chemin storage `photos`, jamais une URL : les URLs signées sont live (D16).
    photo_path: z.string().nullable(),
    notes: z.string().nullable(),
    reading_at: dbTimestamp, // moment de la manipulation utilisateur (D14)
    deleted_at: dbTimestamp.nullable(), // NULL = vivant ; sinon soft-deleted (D7)
    deleted_by: z.uuid().nullable(),
    restored_at: dbTimestamp.nullable(),
    created_at: dbTimestamp,
  })
  .transform((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    userId: row.user_id,
    km: row.km,
    fuelPercent: row.fuel_percent,
    photoPath: row.photo_path,
    notes: row.notes,
    readingAt: row.reading_at,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    restoredAt: row.restored_at,
    createdAt: row.created_at,
  }))

/** Relevé du compteur : forme domaine, inférée du schéma (D26). */
export type Reading = z.output<typeof readingRowSchema>

/** Ce qu'une ligne `kilometers` doit fournir au schéma (anti-dérive, D24) :
 * les repositories le donnent en paramètre de leur mapping, donc tout écart
 * avec le type généré est une erreur de compilation, pas un crash runtime. */
export type ReadingRowInput = z.input<typeof readingRowSchema>
