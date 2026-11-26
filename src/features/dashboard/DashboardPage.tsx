// Dashboard v1 (D4) : dernier kilométrage, dernier relevé, graphique
// d'évolution Recharts (D12) et accès à la saisie. Les données viennent de
// useReadings ; la page ne fait que les mettre en forme.
import { Link } from 'react-router'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
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
import { useReadings } from '@/hooks/useReadings'
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
  // Tri de récence : readings[0] est le dernier relevé (la version complète,
  // là où lastReading ne porte que km/readingAt pour la validation D6).
  const latest = readings[0] ?? null

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

      <Button asChild size="lg" className="w-full">
        <Link to="/saisie">Saisir un relevé</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Évolution du compteur</CardTitle>
          <CardDescription>
            {readings.length > 1
              ? `Depuis le ${formatDateTime(readings[readings.length - 1].readingAt)}`
              : 'Ajoutez des relevés pour voir la courbe'}
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
