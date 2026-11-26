// Point d'entrée métier pour l'UI : l'état et les actions d'authentification.
import { useContext } from 'react'
import { AuthContext } from '@/hooks/authContext'
import type { AuthContextValue } from '@/hooks/authContext'

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  }
  return context
}
