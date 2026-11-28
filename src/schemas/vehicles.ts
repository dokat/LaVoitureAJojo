// Source de vérité du type Vehicle (D26) : la ligne `vehicles` telle que la
// renvoie PostgREST, transformée en forme domaine. Flotte = un réel + un de
// dev (D2/D3) ; depuis D44, aucun marqueur d'activation en base — le véhicule
// « courant » est un choix par navigateur (lib/vehicleSelection).
// created_at est optionnel : le select des repositories l'omet.
import { z } from 'zod'
import { dbTimestamp } from '@/schemas/common'

export const vehicleRowSchema = z
  .object({
    id: z.uuid(),
    brand: z.string(),
    model: z.string(),
    plate: z.string(),
    // created_at n'est pas sélectionné par les repositories ; il est inféré
    // comme optionnel pour que le schéma accepte aussi les lignes complètes.
    created_at: dbTimestamp.optional(),
  })
  .transform((row) => ({
    id: row.id,
    brand: row.brand,
    model: row.model,
    plate: row.plate,
  }))

/** Véhicule de la flotte : forme domaine, inférée du schéma (D26). */
export type Vehicle = z.output<typeof vehicleRowSchema>

/** Ce qu'une ligne `vehicles` doit fournir au schéma (anti-dérive, D24) : les
 * repositories le donnent en paramètre de leur mapping, donc tout écart avec
 * le type généré est une erreur de compilation, pas un crash runtime. */
export type VehicleRowInput = z.input<typeof vehicleRowSchema>
