// Garde de route admin (tâche 4, milestone 6) : un membre qui atteint une
// URL réservée est renvoyé au dashboard. Le rôle vient du contexte (lu depuis
// profiles, D22) ; on patiente tant qu'il n'est pas chargé — sinon un admin
// arriverait éjecté avant la fin de sa lecture de rôle. La RLS reste la
// vérité ; ce garde n'est que l'UX.
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '@/hooks/useAuth'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, role, isAdmin } = useAuth()
  if (status === 'loading' || (status === 'signed-in' && role === null)) {
    return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
  }
  if (status === 'signed-out') {
    return <Navigate to="/login" replace />
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
