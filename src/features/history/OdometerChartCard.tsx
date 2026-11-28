// Carte « Évolution du compteur » : le graphique Recharts (D12), déplacé du
// dashboard dans l'historique (D43). Les points restent la chronologie native
// `kilometers` VIVANTE (arrivées + départ de la sortie ouverte) : les lignes
// mortes que le toggle admin ajoute à `trips.readings` sont filtrées à
// l'entrée, la base garde la vérité (D7/D33).
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
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
import { formatDateTime, formatKm } from '@/lib/format'

const chartConfig = {
  km: { label: 'Kilométrage', color: 'var(--chart-2)' },
} satisfies ChartConfig

// Le graphique se lit dans l'ordre chronologique, la liste reçue est du plus
// récent au plus ancien : on inverse pour l'affichage.
const chartDataOf = (readings: { km: number; readingAt: Date }[]) =>
  [...readings]
    .reverse()
    .map((reading) => ({ ts: reading.readingAt.getTime(), km: reading.km }))

export function OdometerChartCard({
  readings,
}: {
  readings: { km: number; readingAt: Date }[]
}) {
  const chartData = chartDataOf(readings)
  return (
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
  )
}
