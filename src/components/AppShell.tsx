// Layout mobile-first (D11) : en-tête compact + zone de défilement + barre de
// navigation basse (pouce). Les écrans métier s'affichent dans <Outlet />.
import { NavLink, Outlet } from 'react-router'
import { cn } from 'cn'
import { Gauge, History, Plus } from 'lucide-react'

const navItemClass =
  'flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground ' +
  'aria-[current=page]:font-medium aria-[current=page]:text-foreground'

export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-baseline justify-between px-4 py-3">
          <span className="font-heading text-sm font-semibold">
            LaVoitureAJojo
          </span>
          <NavLink
            to="/compte"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Mon compte
          </NavLink>
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
