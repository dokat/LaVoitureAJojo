// Écran « Mon compte » : session, rôle tel que chargé depuis profiles
// (milestone 3) et déconnexion. Milestone 6 : accès à l'écran d'administration
// des véhicules, proposé seulement aux admins (D8) — la route a sa propre
// garde, le lien n'est que l'UX.
import { Link } from 'react-router'
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
    <div className="mx-auto grid w-full max-w-sm gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Mon compte</CardTitle>
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
        </CardContent>
        {isAdmin && (
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link to="/admin/vehicules">Administration des véhicules</Link>
            </Button>
          </CardFooter>
        )}
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link to="/en-attente">Items en attente de synchronisation</Link>
          </Button>
        </CardFooter>
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
    </div>
  )
}
