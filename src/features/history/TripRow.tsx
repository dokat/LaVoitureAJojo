// Ligne d'historique PAR SORTIE (D38, milestone 11) : départ → arrivée,
// distance, auteur(s), photos cliquables de chaque extrémité (URL signée,
// D16) et badges — « en cours », « annulée » (D36), « supprimée » (D7).
// Actions par agrégat, jamais par relevé isolé : supprimer une sortie
// soft-delete ses deux relevés (D33), la restaurer les remet en chronologie
// (D37, admin), annuler une sortie ouverte est réservé à l'auteur ou admin
// (D33). L'UI reflète la RLS ; la base garde la vérité.
import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, RotateCcw, Trash2, XOctagon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import type { TripEntry } from '@/hooks/useTrips'
import type { Reading } from '@/schemas/kilometers'

export type TripRowActions = {
  /** Gérer (clôturer/annuler/supprimer) : auteur du départ ou admin (D33). */
  canManage: boolean
  /** Restaurer/lever l'annulation : admin seulement (D7/D36/D37). */
  canRestore: boolean
  /** Libellé d'auteur (email — D27). */
  labelOf: (userId: string) => string
  onCancel: (tripId: string) => Promise<string | null>
  onDelete: (tripId: string) => Promise<string | null>
  onRestore: (tripId: string) => Promise<string | null>
}

function EndpointPhoto({ reading, side }: { reading: Reading; side: string }) {
  const { url, status, error, load } = usePhotoUrl(reading.photoPath)
  if (!reading.photoPath) return null
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-lg ring-1 ring-foreground/10 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          // URL signée éphémère : régénérée à chaque ouverture (D16).
          onClick={() => void load()}
          aria-label={`Photo ${side.toLowerCase()} de ${formatKm(reading.km)} km`}
        >
          {url ? (
            <img
              src={url}
              alt={`Photo ${side.toLowerCase()} du relevé de ${formatKm(reading.km)} km`}
              className="size-12 rounded-lg object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">
              Photo
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {side} — {formatKm(reading.km)} km
          </DialogTitle>
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
            alt={`Photo ${side.toLowerCase()} du relevé de ${formatKm(reading.km)} km`}
            className="max-h-[70svh] w-full rounded-lg object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EndpointCell({
  side,
  reading,
  labelOf,
}: {
  side: 'Départ' | 'Arrivée'
  reading: Reading | null
  labelOf: (userId: string) => string
}) {
  return (
    <div className="grid content-start gap-0.5 rounded-lg bg-muted/40 p-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {side}
      </span>
      {reading ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <EndpointPhoto reading={reading} side={side} />
            <span className="text-sm font-medium tabular-nums">
              {formatKm(reading.km)} km
            </span>
            {reading.fuelPercent !== null && (
              <Badge variant="secondary">{reading.fuelPercent} %</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(reading.readingAt)}
            {' — '}
            {labelOf(reading.userId)}
          </span>
          {reading.notes && (
            <span className="truncate text-xs text-muted-foreground italic">
              {reading.notes}
            </span>
          )}
        </>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  )
}

export function TripRow({
  entry,
  actions,
}: {
  entry: TripEntry
  actions: TripRowActions
}) {
  const [actionError, setActionError] = useState<string | null>(null)
  const cancelled = entry.trip.cancelledAt !== null
  const deleted =
    !cancelled &&
    (entry.startReading?.deletedAt != null ||
      entry.endReading?.deletedAt != null)
  const dead = cancelled || deleted
  const open = entry.isOpen && !cancelled

  return (
    <Card size="sm" className={dead ? 'opacity-70' : undefined}>
      <CardContent className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium tabular-nums">
            {entry.distanceKm !== null
              ? `${formatKm(entry.distanceKm)} km`
              : open
                ? 'Sortie en cours'
                : 'Sortie'}
            <ArrowRight className="size-3.5 text-muted-foreground" />
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {open && <Badge variant="secondary">En cours</Badge>}
            {cancelled && <Badge variant="destructive">Annulée</Badge>}
            {deleted && <Badge variant="destructive">Supprimée</Badge>}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <EndpointCell
            side="Départ"
            reading={entry.startReading}
            labelOf={actions.labelOf}
          />
          <EndpointCell
            side="Arrivée"
            reading={entry.endReading}
            labelOf={actions.labelOf}
          />
        </div>

        {cancelled && entry.trip.cancelledAt && (
          <p className="text-xs text-muted-foreground">
            Annulée le {formatDateTime(entry.trip.cancelledAt)} — ses relevés
            sont masqués (D36).
          </p>
        )}
        {deleted && entry.startReading?.deletedAt && (
          <p className="text-xs text-muted-foreground">
            Supprimée le {formatDateTime(entry.startReading.deletedAt)} (ses
            deux relevés sont masqués, D33).
          </p>
        )}

        {actionError && (
          <p role="alert" className="text-xs text-destructive">
            {actionError}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {open && actions.canManage && (
            <Button asChild variant="outline" size="sm">
              <Link to="/saisie">
                <XOctagon className="size-4" />
                Terminer
              </Link>
            </Button>
          )}
          {open && actions.canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  Annuler
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Annuler cette sortie ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    La sortie disparaît de la chronologie et son relevé de
                    départ est masqué (soft-delete, D36). Seul un admin pourra
                    lever l’annulation.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Revenir</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () =>
                      setActionError(await actions.onCancel(entry.trip.id))
                    }
                  >
                    Annuler la sortie
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!open && !dead && actions.canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Supprimer la sortie"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer cette sortie ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Suppression douce PAR AGRÉGAT (D33/D7) : les deux relevés
                    sont masqués, les octets des photos restent en storage. Un
                    admin pourra tout restaurer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Revenir</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () =>
                      setActionError(await actions.onDelete(entry.trip.id))
                    }
                  >
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {dead && actions.canRestore && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () =>
                setActionError(await actions.onRestore(entry.trip.id))
              }
            >
              <RotateCcw className="size-4" />
              Restaurer
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
