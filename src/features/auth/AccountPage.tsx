// Écran protégé d'attente (le dashboard arrive au milestone 5) : il prouve
// la session et le rôle tel que chargé depuis profiles (milestone 3).
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'

export function AccountPage() {
  const { user, role, isAdmin, signOut } = useAuth()
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Bienvenue</CardTitle>
          <CardDescription>
            {user?.email ?? 'Compte sans email'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Rôle (lu depuis profiles) :{' '}
            <span className="font-medium text-foreground">
              {role ?? 'chargement…'}
            </span>
            {isAdmin && ' — administrateur'}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Le dashboard d'historique arrive au milestone 5.
          </p>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void signOut()}
          >
            Se déconnecter
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
