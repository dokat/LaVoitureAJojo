// Page d'atterrissage des voyages externes (OAuth Google, lien de reset).
// supabase-js monnaye le code ou le hash de l'URL tout seul (detectSessionInUrl) ;
// on n'affiche qu'un état d'attente puis on rentre dans l'app.
import { Navigate } from 'react-router'
import { useAuth } from '@/hooks/useAuth'

export function AuthCallbackPage() {
  const { status } = useAuth()
  if (status === 'signed-in') {
    return <Navigate to="/" replace />
  }
  if (status === 'signed-out') {
    return <Navigate to="/login" replace />
  }
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Connexion en cours…</p>
    </main>
  )
}
