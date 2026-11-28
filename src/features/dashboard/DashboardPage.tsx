// Dashboard (D4, D38) : dernier km connu, dernier relevé. Milestone 11 : s'il
// existe une SORTIE EN COURS (D35, au plus une), une carte la montre (départ,
// depuis quand, qui) avec le bouton Terminer — l'accès principal à la clôture,
// qui mène au formulaire de /saisie. Le CTA hors sortie devient « Démarrer une
// sortie ». D42 : carte « Dernières sorties » — les 2 dernières sorties
// clôturées, en condensé (distance, extrémités km + date, auteur), lien vers
// l'historique. Le graphique d'évolution est parti dans l'historique (D43).
import { Link } from 'react-router'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useProfiles } from '@/hooks/useProfiles'
import { useReadings } from '@/hooks/useReadings'
import { isLiveTrip, useTrips } from '@/hooks/useTrips'
import { RecentTripsCard } from '@/features/dashboard/RecentTripsCard'
import { formatDateTime, formatKm } from '@/lib/format'

export function DashboardPage() {
  const { status, error, vehicle, readings, reload } = useReadings()
  const trips = useTrips(vehicle?.id ?? null)
  const { labelOf } = useProfiles()
  // Tri de récence : readings[0] est le dernier relevé vivant — le « dernier
  // km connu » (D38), qui est le départ de la sortie ouverte s'il y en a une.
  const latest = readings[0] ?? null
  const openEntry = trips.openTrip
  // Les 2 dernières sorties vécues (D42) : `entries` est déjà trié par date de
  // sortie, la plus récente en premier (D45, hook) ; les mortes sont masquées
  // (isLiveTrip) et la sortie en cours a sa propre carte (D35).
  const recentTrips = useMemo(
    () =>
      trips.entries
        .filter((entry) => isLiveTrip(entry) && !entry.isOpen)
        .slice(0, 2),
    [trips.entries],
  )

  if (status === 'loading') {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Chargement…
      </p>
    )
  }
  if (status === 'error') {
    return (
      <div className="grid gap-3 py-8 text-center">
        <p role="alert" className="text-sm text-destructive">
          {error?.message ?? 'Erreur de chargement.'}
        </p>
        <Button variant="outline" onClick={() => void reload()}>
          Réessayer
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardDescription>
            {vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Véhicule'}
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {latest ? `${formatKm(latest.km)} km` : '—'}
          </CardTitle>
        </CardHeader>
        {latest && (
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p>Dernier relevé du {formatDateTime(latest.readingAt)}</p>
            {latest.fuelPercent !== null && (
              <p>
                Essence :{' '}
                <Badge variant="secondary">{latest.fuelPercent} %</Badge>
              </p>
            )}
            {latest.notes && <p className="italic">« {latest.notes} »</p>}
          </CardContent>
        )}
      </Card>

      {openEntry ? (
        <Card>
          <CardHeader>
            <CardTitle>Sortie en cours</CardTitle>
            <CardDescription>
              Départ {formatKm(openEntry.startReading?.km ?? 0)} km le{' '}
              {formatDateTime(
                openEntry.startReading?.readingAt ?? openEntry.trip.createdAt,
              )}{' '}
              · par{' '}
              {openEntry.startReading
                ? labelOf(openEntry.startReading.userId)
                : 'auteur inconnu'}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-col gap-2">
            <Button asChild size="lg" className="w-full">
              <Link to="/saisie">Terminer la sortie</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Ou{' '}
              <Link to="/saisie" className="underline">
                gérer les sorties
              </Link>{' '}
              — ouverture, annulation, relais (D35).
            </p>
          </CardFooter>
        </Card>
      ) : (
        <Button asChild size="lg" className="w-full">
          <Link to="/saisie">Démarrer une sortie</Link>
        </Button>
      )}

      {recentTrips.length > 0 && (
        <RecentTripsCard entries={recentTrips} labelOf={labelOf} />
      )}
    </div>
  )
}
