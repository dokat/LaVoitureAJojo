// Contrat du contexte d'auth, sans JSX : le moteur (useAuthState), le
// provider (features/auth) et le consumer (useAuth) partagent ce type.
import { createContext } from 'react'
import type {
  AuthError,
  AuthUser,
  ProfileRole,
} from '@/repositories/authRepository'

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out'

export type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  /** Rôle lu depuis profiles après le login ; null tant que non chargé. */
  role: ProfileRole | null
  isAdmin: boolean
  /** Résout à null si OK, à l'erreur typée sinon (l'UI affiche message). */
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<AuthError | null>
  signInWithGoogle: () => Promise<AuthError | null>
  sendPasswordReset: (email: string) => Promise<AuthError | null>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
