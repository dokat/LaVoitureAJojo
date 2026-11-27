// Source de vérité du type Trip (D26, D30) : la ligne `trips` — pure couche de
// liaison entre deux relevés de `kilometers`. Le schéma ne décrit que cette
// ligne : les dates et la distance d'une sortie sont DÉRIVÉES des relevés, donc
// elles se construisent côté hook (useTrips joint par id), jamais ici — une
// ligne trips ne porte ni km ni date (tranché en session M10, cf. notes du
// plan). Les règles D34/D35/D36 restent gardées en base par les triggers.
import { z } from 'zod'
import { dbTimestamp } from '@/schemas/common'

export const tripRowSchema = z
  .object({
    id: z.uuid(),
    vehicle_id: z.uuid(),
    start_reading_id: z.uuid(),
    // NULL = sortie en cours (D30) ; une fois posée, immuable (D33).
    end_reading_id: z.uuid().nullable(),
    // Annulation (D36) : miroir du soft-delete du départ, entretenu en base.
    cancelled_at: dbTimestamp.nullable(),
    created_at: dbTimestamp,
  })
  .transform((row) => ({
    id: row.id,
    vehicleId: row.vehicle_id,
    startReadingId: row.start_reading_id,
    endReadingId: row.end_reading_id,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  }))

/** Sortie : forme domaine de la ligne de liaison (D30), inférée du schéma (D26). */
export type Trip = z.output<typeof tripRowSchema>

/** Ce qu'une ligne `trips` doit fournir au schéma (anti-dérive, D24) : les
 * repositories le donnent en paramètre de leur mapping, donc tout écart avec
 * le type généré est une erreur de compilation, pas un crash runtime. */
export type TripRowInput = z.input<typeof tripRowSchema>
