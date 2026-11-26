// Historique v1 (D4) : liste chronologique inversée (la plus récente en
// tête — ordre garanti par useReadings), photo cliquable via URL signée
// (D16). Pas de suppression ici : le soft-delete est l'objet du milestone 6.
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useReadings } from '@/hooks/useReadings'
import { usePhotoUrl } from '@/hooks/usePhotoUrl'
import { formatDateTime, formatKm } from '@/lib/format'
import type { Reading } from '@/schemas/kilometers'

function PhotoThumbnail({ reading }: { reading: Reading }) {
  const { url, status, error, load } = usePhotoUrl(reading.photoPath)

  if (!reading.photoPath) return null
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-lg ring-1 ring-foreground/10 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          // URL signée éphémère (10 min) : on en régénère une à chaque
          // ouverture ; l'ancienne reste affichée pendant le rechargement.
          onClick={() => void load()}
          aria-label={`Photo du relevé du ${formatDateTime(reading.readingAt)}`}
        >
          {url ? (
            <img
              src={url}
              alt={`Photo du relevé de ${formatKm(reading.km)} km`}
              className="size-16 rounded-lg object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
              Photo
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{formatKm(reading.km)} km</DialogTitle>
          <DialogDescription>
            {formatDateTime(reading.readingAt)}
          </DialogDescription>
        </DialogHeader>
        {status === 'loading' && !url && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chargement de la photo…
          </p>
        )}
        {status === 'error' && !url && (
          <div className="grid gap-2 py-4 text-center">
            <p role="alert" className="text-sm text-destructive">
              {error?.message ?? 'Photo indisponible.'}
            </p>
            <Button variant="outline" onClick={() => void load()}>
              Réessayer
            </Button>
          </div>
        )}
        {url && (
          <img
            src={url}
            alt={`Photo du relevé de ${formatKm(reading.km)} km`}
            className="max-h-[70svh] w-full rounded-lg object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReadingRow({ reading }: { reading: Reading }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <PhotoThumbnail reading={reading} />
        <div className="grid gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums">
              {formatKm(reading.km)} km
            </span>
            {reading.fuelPercent !== null && (
              <Badge variant="secondary">{reading.fuelPercent} %</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(reading.readingAt)}
          </span>
          {reading.notes && (
            <span className="text-sm text-muted-foreground italic">
              {reading.notes}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function HistoryPage() {
  const { status, error, readings, reload } = useReadings()

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
    <div className="grid gap-2">
      <CardHeader>
        <CardTitle>Historique</CardTitle>
        <CardDescription>
          {readings.length} relevé{readings.length > 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      {readings.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucun relevé pour l’instant.
        </p>
      )}
      {readings.map((reading) => (
        <ReadingRow key={reading.id} reading={reading} />
      ))}
    </div>
  )
}
