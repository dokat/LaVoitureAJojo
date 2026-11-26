// Écran « Mon compte » : session, rôle tel que chargé depuis profiles
// (milestone 3) et déconnexion. Accessible depuis l'en-tête du layout (M5).
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
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Mon compte</CardTitle>
        <CardDescription>{user?.email ?? 'Compte sans email'}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Rôle (lu depuis profiles) :{' '}
          <span className="font-medium text-foreground">
            {role ?? 'chargement…'}
          </span>
          {isAdmin && ' — administrateur'}
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
  )
}
