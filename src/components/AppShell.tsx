// Layout mobile-first (D11) : en-tête compact + zone de défilement + barre de
// navigation basse (pouce). Les écrans métier s'affichent dans <Outlet />.
// Milestone 7 (D13) : l'en-tête porte l'état réseau — pastille « hors-ligne »
// et badge de la file d'attente, lien vers l'écran « items en attente ».
import { Link, NavLink, Outlet } from 'react-router'
import { cn } from 'cn'
import { CloudOff, Gauge, History, Plus } from 'lucide-react'
import { usePendingQueue } from '@/hooks/usePendingQueue'

const navItemClass =
  'flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground ' +
  'aria-[current=page]:font-medium aria-[current=page]:text-foreground'

export function AppShell() {
  const { items, count, conflicts, online } = usePendingQueue()
  // D39 : la file porte aussi des intentions sortie — l'indicateur le dit.
  const tripCount = items.filter(
    (item) => (item.intent ?? 'reading') !== 'reading',
  ).length
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-baseline justify-between gap-2 px-4 py-3">
          <span className="font-heading text-sm font-semibold">
            LaVoitureAJojo
          </span>
          <div className="flex items-center gap-3">
            {!online && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CloudOff className="size-3.5" />
                hors-ligne
              </span>
            )}
            {count > 0 && (
              <Link
                to="/en-attente"
                className={cn(
                  'text-xs underline-offset-2 hover:underline',
                  conflicts > 0
                    ? 'font-medium text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {count} en attente
                {tripCount > 0
                  ? ` · ${tripCount} sortie${tripCount > 1 ? 's' : ''}`
                  : ''}
              </Link>
            )}
            <NavLink
              to="/compte"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mon compte
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        <Outlet />
      </main>

      <nav className="sticky bottom-0 z-10 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-lg">
          <NavLink to="/" end className={navItemClass}>
            <Gauge className="size-5" />
            Dashboard
          </NavLink>
          <NavLink to="/saisie" className={cn(navItemClass, 'py-1.5')}>
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="size-5" />
            </span>
            Saisir
          </NavLink>
          <NavLink to="/historique" className={navItemClass}>
            <History className="size-5" />
            Historique
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
