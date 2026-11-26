// Moteur de la session : écoute authRepository, charge le rôle depuis
// profiles à chaque login, expose les actions (D10, D15). Sans JSX —
// AuthProvider (features/auth) ne fait que le brancher au contexte.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as authRepository from '@/repositories/authRepository'
import type { AuthContextValue, AuthStatus } from '@/hooks/authContext'
import type {
  AuthError,
  AuthUser,
  ProfileRole,
} from '@/repositories/authRepository'

async function run(action: () => Promise<void>): Promise<AuthError | null> {
  try {
    await action()
    return null
  } catch (error) {
    return error instanceof authRepository.AuthError
      ? error
      : new authRepository.AuthError('unknown', String(error))
  }
}

export function useAuthState(): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [role, setRole] = useState<ProfileRole | null>(null)
  const [ready, setReady] = useState(false)
  const roleLoadedFor = useRef<string | null>(null)

  useEffect(() => {
    const handle = (nextUser: AuthUser | null) => {
      setReady(true)
      setUser(nextUser)
      if (!nextUser) {
        roleLoadedFor.current = null
        setRole(null)
        return
      }
      // Le rôle ne dépend que de l'identité : on ne le relit pas à chaque
      // rafraîchissement de token, seulement quand l'utilisateur change.
      if (roleLoadedFor.current !== nextUser.id) {
        roleLoadedFor.current = nextUser.id
        setRole(null)
        authRepository
          .fetchProfileRole(nextUser.id)
          .then(setRole)
          .catch(() => setRole('membre')) // jamais admin par défaut (D8)
      }
    }

    const unsubscribe = authRepository.onAuthChange(handle)
    // Filet : si l'événement INITIAL_SESSION nous échappe (page arrivant
    // depuis un voyage OAuth déjà monnayé par le client).
    authRepository
      .getCurrentUser()
      .then(handle)
      .catch(() => setReady(true))
    return unsubscribe
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: (ready
        ? user
          ? 'signed-in'
          : 'signed-out'
        : 'loading') satisfies AuthStatus,
      user,
      role,
      isAdmin: role === 'admin',
      signInWithPassword: (email, password) =>
        run(() => authRepository.signInWithPassword(email, password)),
      signInWithGoogle: () =>
        run(async () => {
          window.location.assign(await authRepository.getGoogleAuthUrl())
        }),
      sendPasswordReset: (email) =>
        run(() => authRepository.sendPasswordReset(email)),
      signOut: async () => {
        await run(() => authRepository.signOut())
      },
    }),
    [ready, user, role],
  )

  return value
}
