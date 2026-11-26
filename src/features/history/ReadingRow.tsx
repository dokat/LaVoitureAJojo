// Ligne d'historique (milestone 6) : le relevé et ses actions selon le rôle.
// Membre : supprimer les SIENS (D8). Admin : supprimer celles d'autrui,
// restaurer une ligne morte, voir l'auteur. L'UI ne fait que refléter la
// RLS (l'auteur est vérifié par compare d'id de session) ; la base garde la
// vérité — un clic hors droit ne produirait rien.
import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { usePhotoUrl } from '@/hooks/usePhotoUrl'
import { formatDateTime, formatKm } from '@/lib/format'
import type { Reading } from '@/schemas/kilometers'

export type ReadingActions = {
  /** Soft-delete réservé : auteur ou admin (D8) — l'appelant a filtré. */
  canDelete: boolean
  /** Restauration : admin seulement (D7/D8). */
  canRestore: boolean
  /** Libellé d'auteur (email — D27), affiché à l'admin uniquement. */
  authorLabel?: string
  onDelete: (readingId: string) => Promise<string | null>
  onRestore: (readingId: string) => Promise<string | null>
}

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

export function ReadingRow({
  reading,
  actions,
}: {
  reading: Reading
  actions: ReadingActions
}) {
  const deleted = reading.deletedAt !== null
  const [actionError, setActionError] = useState<string | null>(null)

  return (
    <Card size="sm" className={deleted ? 'opacity-70' : undefined}>
      <CardContent className="flex items-center gap-3">
        <PhotoThumbnail reading={reading} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium tabular-nums">
              {formatKm(reading.km)} km
            </span>
            {reading.fuelPercent !== null && (
              <Badge variant="secondary">{reading.fuelPercent} %</Badge>
            )}
            {deleted && <Badge variant="destructive">Supprimé</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(reading.readingAt)}
            {actions.authorLabel && ` — ${actions.authorLabel}`}
          </span>
          {deleted && reading.deletedAt && (
            <CardDescription className="text-xs">
              Supprimé le {formatDateTime(reading.deletedAt)}
            </CardDescription>
          )}
          {reading.notes && (
            <span className="truncate text-sm text-muted-foreground italic">
              {reading.notes}
            </span>
          )}
          {actionError && (
            <p role="alert" className="text-xs text-destructive">
              {actionError}
            </p>
          )}
        </div>
        {deleted
          ? actions.canRestore && (
              <Button
                variant="outline"
                size="sm"
                aria-label={`Restaurer le relevé de ${formatKm(reading.km)} km`}
                onClick={async () =>
                  setActionError(await actions.onRestore(reading.id))
                }
              >
                <RotateCcw className="size-4" />
                Restaurer
              </Button>
            )
          : actions.canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Supprimer le relevé de ${formatKm(reading.km)} km`}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce relevé ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {formatKm(reading.km)} km du{' '}
                      {formatDateTime(reading.readingAt)} — suppression douce :
                      la ligne reste en base, un admin peut la restaurer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () =>
                        setActionError(await actions.onDelete(reading.id))
                      }
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
      </CardContent>
    </Card>
  )
}
