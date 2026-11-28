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
  | 'not_found' // ligne absente, flotte vide
  | 'network' // supabase-js n'a pas atteint le serveur
  | 'photo_upload' // relevé inséré, octets photo non partis (D16)
  // Marqueurs des triggers `trips` (M9 → M10, D33→D36) :
  | 'trip_km_order' // clôture D34 : km arrivée < km départ
  | 'trip_date_order' // clôture D34 : date arrivée < date départ
  | 'trip_relay_conflict' // relais D35 refusé (km ou date en retrait)
  | 'trip_already_open' // rejeu : ce relevé ouvre déjà une sortie (UNIQUE D30)
  | 'trip_concurrent_open' // course D35 : index une sortie ouverte
  | 'trip_immutable' // D33 : départ/id figés, sortie clôturée non réouvrable
  | 'trip_admin_only' // levée d'annulation réservée à l'admin (D36)
  | 'unknown'

export class DataError extends Error {
  readonly code: DataErrorCode

  constructor(code: DataErrorCode, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'DataError'
    this.code = code
  }
}

/** Codes propres à l'agrégat sortie (D33→D36) ; les erreurs génériques
 * (réseau, RLS, inconnue) restent des DataError simples. */
export type TripErrorCode =
  | 'trip_km_order'
  | 'trip_date_order'
  | 'trip_relay_conflict'
  | 'trip_already_open'
  | 'trip_concurrent_open'
  | 'trip_immutable'
  | 'trip_admin_only'

/** Erreur d'une écriture `trips` (ou de sa contagion sur `kilometers`).
 * C'est une DataError : les appelants existants (instanceof, .code) marchent. */
export class TripError extends DataError {
  declare readonly code: TripErrorCode

  constructor(code: TripErrorCode, message: string, cause?: unknown) {
    super(code, message, cause)
    this.name = 'TripError'
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
  trip_km_order:
    'Le compteur d\u2019arrivée est plus bas que celui du départ : une sortie ' +
    'ne peut pas finir sous son point de départ (règle D34).',
  trip_date_order:
    'La date d\u2019arrivée est antérieure à celle du départ : une sortie se ' +
    'clôt après son ouverture (règle D34).',
  trip_relay_conflict:
    'Ce relevé ne peut pas clôturer la sortie en cours (compteur ou date en ' +
    'retrait) : vérifiez le compteur, ou demandez à l\u2019admin (D35).',
  trip_already_open:
    'Ce relevé ouvre déjà une sortie en base (rejeu reconnu, D30).',
  trip_concurrent_open:
    'Une sortie vient de s\u2019ouvrir entre-temps : rechargez et recommencez ' +
    '(course du relais, D35).',
  trip_immutable:
    'Une sortie ne s\u2019édite pas : annuler puis redémarrer, ou supprimer ' +
    'puis ressaisir en rétroactif (D33).',
  trip_admin_only: 'Lever une annulation est réservé à l\u2019admin (D36).',
  unknown: 'Erreur inattendue côté base de données.',
}

function message(code: DataErrorCode, original?: string): string {
  return code === 'unknown' && original
    ? `${MESSAGES[code]} (${original})`
    : MESSAGES[code]
}

/** Fabrique d'erreur sortie : message FR figé par le code (D33→D36). */
function trip(code: TripErrorCode, cause?: unknown): TripError {
  return new TripError(code, MESSAGES[code], cause)
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
  // Marqueurs des triggers `trips` (M9) — même patron P0001 (notes M9).
  if (raw.includes('TRIP_RELAY_CONFLICT'))
    return trip('trip_relay_conflict', error)
  if (raw.includes('TRIP_KM_ORDER')) return trip('trip_km_order', error)
  if (raw.includes('TRIP_DATE_ORDER')) return trip('trip_date_order', error)
  if (raw.includes('TRIP_ADMIN_ONLY')) return trip('trip_admin_only', error)
  if (raw.includes('TRIP_IMMUTABLE')) return trip('trip_immutable', error)
  // Violations de contrainte connues de `trips` (23505) : le rejeu hors-ligne
  // d'une ouverture (D39) et la course du relais (D35) se reconnaissent là.
  if (err?.code === '23505') {
    if (raw.includes('trips_start_reading_id_key'))
      return trip('trip_already_open', error)
    if (raw.includes('trips_one_open_per_vehicle'))
      return trip('trip_concurrent_open', error)
  }
  // Violation RLS (WITH CHECK) — p. ex. relevé sur un véhicule hors flotte (D44).
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
