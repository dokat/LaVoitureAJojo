// Auth : seule couche qui parle à Supabase Auth (D10, D15). Les erreurs
// GoTrue sont converties en AuthError typées ; les hooks/UI n'importent
// jamais supabase-js directement.
import { supabase } from '@/lib/supabase'
import { dbProfileRoleSchema } from '@/schemas/profiles'
import type { ProfileRole } from '@/schemas/profiles'

export type { ProfileRole }

export type AuthUser = {
  id: string
  email: string | null
  /** Nom lisible quand le fournisseur l'a fourni (OAuth Google :
   * `user_metadata.full_name`) ; null sinon — l'UI retombe sur l'email (D27). */
  name: string | null
}

export type AuthErrorCode =
  'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' | 'unknown'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

const MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: 'Adresse email non confirmée.',
  rate_limited: 'Trop de tentatives — réessayez dans un moment.',
  unknown: 'Erreur inattendue côté authentification.',
}

function toAuthError(error: unknown): AuthError {
  const err = error as { code?: string; status?: number; message?: string }
  const code: AuthErrorCode =
    err?.code === 'invalid_credentials' || err?.code === 'invalid_grant'
      ? 'invalid_credentials'
      : err?.code === 'email_not_confirmed' ||
          err?.code === 'user_not_confirmed'
        ? 'email_not_confirmed'
        : err?.status === 429 ||
            err?.code === 'over_request_rate_limit' ||
            err?.code === 'over_email_sent_rate_limit'
          ? 'rate_limited'
          : 'unknown'
  return new AuthError(
    code,
    code === 'unknown'
      ? `${MESSAGES.unknown}${err?.message ? ` (${err.message})` : ''}`
      : MESSAGES[code],
  )
}

/** URL de l'app où Supabase doit renvoyer l'utilisateur après un voyage
 * externe (OAuth, lien de reset). Respecte le base path Pages (D17). */
function appUrl(hash: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${window.location.origin}${base}${hash}`
}

function toAuthUser(user: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}): AuthUser {
  const fullName = user.user_metadata?.full_name
  return {
    id: user.id,
    email: user.email ?? null,
    name:
      typeof fullName === 'string' && fullName.trim() !== ''
        ? fullName.trim()
        : null,
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw toAuthError(error)
  return data.session ? toAuthUser(data.session.user) : null
}

/** Notifie l'état courant puis à chaque changement (login, logout,
 * expiration). Retourne la fonction de désabonnement. */
export function onAuthChange(listener: (user: AuthUser | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    listener(session?.user ? toAuthUser(session.user) : null)
  })
  return () => data.subscription.unsubscribe()
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw toAuthError(error)
}

/** URL du consentement Google ; c'est au hook de naviguer dessus (D15). */
export async function getGoogleAuthUrl(): Promise<string> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: appUrl('/auth/callback') },
  })
  if (error) throw toAuthError(error)
  return data.url
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appUrl('/auth/callback'),
  })
  if (error) throw toAuthError(error)
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw toAuthError(error)
}

/** Rôle depuis public.profiles, jamais depuis le JWT (milestone 3).
 * profil absent ⇒ « membre » : on ne promeut jamais par défaut (règle D8,
 * figée dans dbProfileRoleSchema). */
export async function fetchProfileRole(userId: string): Promise<ProfileRole> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw toAuthError(error)
  return data ? dbProfileRoleSchema.parse(data.role) : 'membre'
}
