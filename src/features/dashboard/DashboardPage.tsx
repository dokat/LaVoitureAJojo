// Dashboard (D4, D38) : dernier km connu, dernier relevé, graphique d'évolution
// Recharts (D12) — inchangé depuis M5 : les points restent la chronologie
// native `kilometers` (vivants). Milestone 11 : s'il existe une SORTIE EN
// COURS (D35, au plus une), une carte la montre (départ, depuis quand, qui)
// avec le bouton Terminer — l'accès principal à la clôture, qui mène au
// formulaire de /saisie. Le CTA hors sortie devient « Démarrer une sortie ».
import { Link } from 'react-router'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Badge } from '@/components/ui/badge'
import { useProfiles } from '@/hooks/useProfiles'
import { useReadings } from '@/hooks/useReadings'
import { useTrips } from '@/hooks/useTrips'
import { formatDateTime, formatKm } from '@/lib/format'

const chartConfig = {
  km: { label: 'Kilométrage', color: 'var(--chart-2)' },
} satisfies ChartConfig

// Le graphique se lit dans l'ordre chronologique, la liste de useReadings
// est du plus récent au plus ancien : on inverse pour l'affichage.
const chartDataOf = (readings: { km: number; readingAt: Date }[]) =>
  [...readings]
    .reverse()
    .map((reading) => ({ ts: reading.readingAt.getTime(), km: reading.km }))

export function DashboardPage() {
  const { status, error, vehicle, readings, reload } = useReadings()
  const trips = useTrips(vehicle?.id ?? null)
  const { labelOf } = useProfiles()
  // Tri de récence : readings[0] est le dernier relevé vivant — le « dernier
  // km connu » (D38), qui est le départ de la sortie ouverte s'il y en a une.
  const latest = readings[0] ?? null
  const openEntry = trips.openTrip

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

  const chartData = chartDataOf(readings)

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

      <Card>
        <CardHeader>
          <CardTitle>Évolution du compteur</CardTitle>
          <CardDescription>
            {readings.length > 1
              ? `Depuis le ${formatDateTime(readings[readings.length - 1].readingAt)}`
              : 'Ajoutez des sorties pour voir la courbe'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="min-h-48 w-full">
            <AreaChart data={chartData} margin={{ left: 4, right: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) =>
                  new Intl.DateTimeFormat('fr-FR', {
                    month: 'short',
                    year: '2-digit',
                  }).format(new Date(value))
                }
                minTickGap={24}
              />
              <YAxis
                dataKey="km"
                width={56}
                tickLine={false}
                axisLine={false}
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value: number) => formatKm(value)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="km"
                type="monotone"
                fill="var(--color-km)"
                fillOpacity={0.15}
                stroke="var(--color-km)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
