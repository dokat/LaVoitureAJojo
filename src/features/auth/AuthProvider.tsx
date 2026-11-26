// Branchement minimal du moteur useAuthState sur le contexte (D10 : la
// logique vit dans le hook, pas dans le provider).
import type { ReactNode } from 'react'
import { AuthContext } from '@/hooks/authContext'
import { useAuthState } from '@/hooks/useAuthState'

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState()
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
