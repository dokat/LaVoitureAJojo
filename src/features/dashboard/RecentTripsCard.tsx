// Carte « Dernières sorties » du dashboard (D42) : les deux dernières sorties
// vécues, en condensé — contrairement à l'historique (D38), ni actions ni
// photos : la distance totale, les deux extrémités (km + date) et l'auteur qui
// a enregistré la sortie. Les sorties en cours ont leur propre carte (D35) et
// sont exclues d'office.
import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatKm } from '@/lib/format'
import type { TripEntry } from '@/hooks/useTrips'
import type { Reading } from '@/schemas/kilometers'

function Endpoint({
  side,
  reading,
}: {
  side: 'Départ' | 'Arrivée'
  reading: Reading | null
}) {
  return (
    <div className="grid content-start gap-0.5 rounded-lg bg-muted/40 p-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {side}
      </span>
      <span className="text-sm font-medium tabular-nums">
        {reading ? `${formatKm(reading.km)} km` : '—'}
      </span>
      {reading && (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(reading.readingAt)}
        </span>
      )}
    </div>
  )
}

function RecentTrip({
  entry,
  labelOf,
}: {
  entry: TripEntry
  labelOf: (userId: string) => string
}) {
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium tabular-nums">
          {entry.distanceKm !== null
            ? `${formatKm(entry.distanceKm)} km`
            : 'Sortie'}
        </span>
        <span className="text-xs text-muted-foreground">
          par{' '}
          {entry.startReading
            ? labelOf(entry.startReading.userId)
            : 'auteur inconnu'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Endpoint side="Départ" reading={entry.startReading} />
        <Endpoint side="Arrivée" reading={entry.endReading} />
      </div>
    </div>
  )
}

export function RecentTripsCard({
  entries,
  labelOf,
}: {
  entries: TripEntry[]
  labelOf: (userId: string) => string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dernières sorties</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {entries.map((entry) => (
          <RecentTrip key={entry.trip.id} entry={entry} labelOf={labelOf} />
        ))}
        <p className="text-xs text-muted-foreground">
          <Link to="/historique" className="underline">
            Tout l’historique
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
