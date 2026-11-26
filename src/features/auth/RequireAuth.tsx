// Garde de route : sans session, direction /login ; pendant le boot du
// client Supabase, on patiente (sinon on éjecterait l'utilisateur déjà
// connecté qui arrive depuis un callback OAuth).
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '@/hooks/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') {
    return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
  }
  if (status === 'signed-out') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
