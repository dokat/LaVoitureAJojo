// Source de vérité du type Profile et du rôle applicatif (D26, D8) : la ligne
// `profiles` transformée en forme domaine. La promotion admin se fait en base,
// jamais ici.
import { z } from 'zod'
import { dbTimestamp } from '@/schemas/common'

/** Rôle applicatif, source de vérité : public.profiles + son check SQL (D8). */
export const profileRoleSchema = z.enum(['admin', 'membre'])

export type ProfileRole = z.infer<typeof profileRoleSchema>

/**
 * Règle D8 figée ici, en un seul endroit : jamais de promotion par défaut.
 * La base borne déjà le rôle (check SQL) ; une valeur hors enum (migration
 * ratée, donnée ancienne) se comporte comme un membre au lieu de casser la
 * lecture. Entrée : tout string, comme la colonne générée.
 */
export const dbProfileRoleSchema = z
  .string()
  .pipe(profileRoleSchema)
  .catch('membre')

export const profileRowSchema = z
  .object({
    id: z.uuid(),
    role: dbProfileRoleSchema,
    created_at: dbTimestamp,
  })
  .transform((row) => ({
    id: row.id,
    role: row.role,
    createdAt: row.created_at,
  }))

/** Profil applicatif : forme domaine, inférée du schéma (D26). */
export type Profile = z.output<typeof profileRowSchema>

/** Ce qu'une ligne `profiles` doit fournir au schéma (anti-dérive, D24) : les
 * repositories le donnent en paramètre de leur mapping, donc tout écart avec
 * le type généré est une erreur de compilation, pas un crash runtime. */
export type ProfileRowInput = z.input<typeof profileRowSchema>
