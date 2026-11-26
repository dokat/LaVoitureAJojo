// Erreurs typées de la couche données (D10) : chaque repository convertit les
// erreurs PostgREST/Storage/GoTrue-DB en DataError. Les triggers SQL portent
// leurs marqueurs dans le message (D19 : « KM_REGRESSION », « KM_IMMUTABLE »).
// Le client ne fait que traduire : la base reste la vérité (cf. Dette M2/M4).
// Un ZodError (ligne hors du schéma zod, D26) devient aussi une DataError.
import { ZodError } from 'zod'

export type DataErrorCode =
  | 'km_regression' // trigger D6 à l'insertion ou à la restauration
  | 'km_immutable' // trigger D7 : édition d'un relevé refusée
  | 'permission' // RLS : policy USING silencieuse ou WITH CHECK 42501
  | 'not_found' // ligne absente ou aucun véhicule actif
  | 'network' // supabase-js n'a pas atteint le serveur
  | 'photo_upload' // relevé inséré, octets photo non partis (D16)
  | 'unknown'

export class DataError extends Error {
  readonly code: DataErrorCode

  constructor(code: DataErrorCode, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'DataError'
    this.code = code
  }
}

const MESSAGES: Record<DataErrorCode, string> = {
  km_regression:
    'Le compteur reculerait par rapport au dernier relevé : une valeur ' +
    'inférieure exige une date strictement antérieure (règle D6).',
  km_immutable:
    'Un relevé existant ne s\u2019édite pas : le supprimer puis le ' +
    'ressaisir (D7).',
  permission:
    'Action non autorisée — vos droits ont peut-être changé, rechargez la ' +
    'page.',
  not_found: 'Élément introuvable.',
  network: 'Connexion au serveur impossible — vérifiez votre réseau.',
  photo_upload:
    'Relevé enregistré, mais la photo n\u2019a pas pu être envoyée : le ' +
    'relevé reste visible sans photo.',
  unknown: 'Erreur inattendue côté base de données.',
}

function message(code: DataErrorCode, original?: string): string {
  return code === 'unknown' && original
    ? `${MESSAGES[code]} (${original})`
    : MESSAGES[code]
}

/** Convertit n'importe quoi (erreur Supabase, ZodError, exception JS) en DataError. */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error
  // Ligne hors du schéma zod (D26) : migration non régénérée, colonne qui a
  // changé de type ou de nom. Cassant pour le dev, silencieux pour l'utilisateur.
  if (error instanceof ZodError) {
    const detail = error.issues
      .map(
        (issue) => `${issue.path.join('.') || '(racine)'} : ${issue.message}`,
      )
      .join(' ; ')
    return new DataError(
      'unknown',
      `${MESSAGES.unknown} (schéma : ${detail})`,
      error,
    )
  }
  const err = error as { code?: string; message?: string } | undefined
  const raw =
    err?.message ?? (error instanceof Error ? error.message : String(error))

  // Marqueurs levés par les triggers SQL (code Postgres P0001, message porteur).
  if (raw.includes('KM_REGRESSION'))
    return new DataError('km_regression', message('km_regression'), error)
  if (raw.includes('KM_IMMUTABLE'))
    return new DataError('km_immutable', message('km_immutable'), error)
  // Violation RLS (WITH CHECK) ou tentative sur véhicule non actif.
  if (err?.code === '42501' || raw.includes('row-level security')) {
    return new DataError('permission', message('permission'), error)
  }
  // supabase-js renvoie une erreur sans code côté réseau (fetch a échoué).
  if (
    err?.code === 'ENOTFOUND' ||
    /failed to fetch|networkerror|load failed|\btimeout\b/i.test(raw)
  ) {
    return new DataError('network', message('network'), error)
  }
  // .single() sans ligne → 406/PGRST116.
  if (err?.code === 'PGRST116')
    return new DataError('not_found', message('not_found'), error)
  return new DataError('unknown', message('unknown', raw), error)
}
