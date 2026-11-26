// Briques partagées par les schémas d'agrégats (D26).
import { z } from 'zod'

/**
 * Colonne `timestamptz` côté PostgREST (chaîne ISO 8601, avec `Z` ou offset)
 * → `Date` du domaine. Les dates SQL ne sortent jamais des repositories sous
 * forme de string : la sémantique D14 est portée par le schéma, pas par les
 * appelants.
 */
export const dbTimestamp = z.iso
  .datetime({ offset: true })
  .transform((iso) => new Date(iso))
