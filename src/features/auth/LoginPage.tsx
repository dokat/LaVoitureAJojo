// Écran de connexion (D15) : email + mot de passe, Google, reset par email.
// Pas d'inscription in-app : la whitelist se gère dans le dashboard Supabase.
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { status, signInWithPassword, signInWithGoogle, sendPasswordReset } =
    useAuth()
  const [mode, setMode] = useState<'signin' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (status === 'signed-in') {
    return <Navigate to="/" replace />
  }
  if (status === 'loading') {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setPending(true)
    const failure =
      mode === 'signin'
        ? await signInWithPassword(email.trim(), password)
        : await sendPasswordReset(email.trim())
    setPending(false)
    if (failure) {
      setError(failure.message)
    } else if (mode === 'reset') {
      setInfo('Un email de réinitialisation vient d’être envoyé.')
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>LaVoitureAJojo</CardTitle>
          <CardDescription>
            {mode === 'signin'
              ? 'Connectez-vous pour saisir ou consulter le kilométrage.'
              : 'Indiquez votre email : un lien de réinitialisation vous sera envoyé.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {mode === 'signin' && (
              <div className="grid gap-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {info && (
              <p role="status" className="text-sm text-muted-foreground">
                {info}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {mode === 'signin'
                ? 'Se connecter'
                : 'Envoyer le lien de réinitialisation'}
            </Button>
            {mode === 'reset' && (
              <Button
                type="button"
                variant="link"
                className="w-full"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setInfo(null)
                }}
              >
                Retour à la connexion
              </Button>
            )}
          </CardContent>
          <CardFooter className="grid gap-2">
            {mode === 'signin' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    setError(null)
                    void signInWithGoogle()
                  }}
                >
                  Continuer avec Google
                </Button>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    setMode('reset')
                    setError(null)
                  }}
                >
                  Mot de passe oublié ?
                </Button>
              </>
            )}
          </CardFooter>
        </form>
      </Card>
    </main>
  )
}
