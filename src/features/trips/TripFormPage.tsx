// `/saisie` — le flux sortie (D31, D38, D41) : le formulaire de relevé brut a
// disparu. Une sortie ouverte ? ⇒ carte « Sortie en cours » (départ, depuis
// quand, qui) avec le formulaire Terminer et le bouton Annuler si on peut la
// gérer (auteur ou admin, D33) ; sinon (membre face à la sortie d'autrui),
// formulaire Démarrer en mode relais — confirmation explicite avant envoi
// (D35). Aucune sortie ouverte ? ⇒ formulaire Démarrer une sortie, repli
// rétroactif inclus (D31).
// Monté hors-ligne : la lecture échoue, le formulaire Démarrer reste
// utilisable — startTrip met l'intention en file et le véhicule se résout au
// renvoi (patron M7, D39).
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { useActiveVehicle } from '@/hooks/useActiveVehicle'
import { useAuth } from '@/hooks/useAuth'
import { useProfiles } from '@/hooks/useProfiles'
import {
  useTrips,
  type CompleteTripResult,
  type TripEntry,
  type TripEndpointInput,
} from '@/hooks/useTrips'
import { formatDateTime, formatKm } from '@/lib/format'
import { CloseTripForm } from '@/features/trips/CloseTripForm'
import { StartTripForm } from '@/features/trips/StartTripForm'
import type { TripFeedback } from '@/features/trips/feedback'

/** « depuis 3 h » (D38 : la carte dit depuis quand, pas seulement la date). */
const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
function sinceLabel(date: Date): string {
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}

function FeedbackBanner({
  feedback,
  onDismiss,
}: {
  feedback: NonNullable<TripFeedback>
  onDismiss: () => void
}) {
  return (
    <div
      role="status"
      className={
        'flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm ' +
        (feedback.tone === 'warn'
          ? 'border-destructive/40 bg-destructive/5 text-destructive'
          : feedback.tone === 'queued'
            ? 'border-dashed text-muted-foreground'
            : 'text-muted-foreground')
      }
    >
      <span>{feedback.text}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 shrink-0 px-2 text-xs"
        onClick={onDismiss}
      >
        masquer
      </Button>
    </div>
  )
}

function LoadingBanner() {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      Chargement…
    </p>
  )
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="grid gap-3 py-8 text-center">
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
      <Button variant="outline" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  )
}

/** Carte « Sortie en cours » (D38) : départ, depuis quand, qui — et gestion
 * (Terminer/Annuler) si l'appelant peut la clôturer (auteur ou admin, D33). */
function OpenTripCard({
  entry,
  authorLabel,
  canManage,
  offline,
  onComplete,
  onCancel,
  onFeedback,
}: {
  entry: TripEntry
  authorLabel: string
  canManage: boolean
  offline: boolean
  onComplete: (end: TripEndpointInput) => Promise<CompleteTripResult>
  onCancel: (tripId: string) => Promise<{ message: string } | null>
  onFeedback: (feedback: TripFeedback) => void
}) {
  const [cancelError, setCancelError] = useState<string | null>(null)
  const start = entry.startReading

  const confirmCancel = () => {
    void (async () => {
      setCancelError(null)
      const failure = await onCancel(entry.trip.id)
      if (failure) {
        setCancelError(failure.message)
        return
      }
      onFeedback({
        tone: offline ? 'queued' : 'ok',
        text: offline
          ? 'Hors-ligne : annulation de la sortie mise en file — elle partira à la première connexion (D36/D39).'
          : 'Sortie annulée : son relevé de départ est masqué, seul un admin peut lever l’annulation (D36).',
      })
    })()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Sortie en cours</CardTitle>
          <Badge variant="secondary">
            ouverte {sinceLabel(start?.readingAt ?? entry.trip.createdAt)}
          </Badge>
        </div>
        <CardDescription>
          Départ : {start ? `${formatKm(start.km)} km` : '—'} le{' '}
          {formatDateTime(start?.readingAt ?? entry.trip.createdAt)} · par{' '}
          {authorLabel}
        </CardDescription>
      </CardHeader>
      {canManage && (
        <CardFooter className="flex-col items-stretch gap-3">
          {cancelError && (
            <p role="alert" className="text-sm text-destructive">
              {cancelError}
            </p>
          )}
          <CloseTripForm
            startLabel={
              start
                ? `Rappel du départ : ${formatKm(start.km)} km, ${formatDateTime(
                    start.readingAt,
                  )} — l’arrivée doit être à ce point ou après (D34).`
                : 'Rappel du départ : relevé en cours de chargement.'
            }
            onComplete={onComplete}
            onFeedback={onFeedback}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" className="w-full">
                Annuler la sortie
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Annuler cette sortie ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Rien n’est supprimé : la sortie disparaît de la chronologie et
                  son relevé de départ{' '}
                  {start ? `(${formatKm(start.km)} km)` : ''} est masqué
                  (soft-delete, D36). Seul un admin pourra la rouvrir.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Revenir</AlertDialogCancel>
                <AlertDialogAction onClick={confirmCancel}>
                  Annuler la sortie
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      )}
    </Card>
  )
}

export function TripFormPage() {
  const { user, isAdmin } = useAuth()
  const vehicleView = useActiveVehicle()
  const trips = useTrips(vehicleView.vehicle?.id ?? null)
  const { labelOf } = useProfiles()
  const [feedback, setFeedback] = useState<TripFeedback>(null)

  // Hors-ligne, les lectures peuvent échouer sans que ce soit bloquant : la
  // saisie reste possible et l'intention part en file (D39, patron M7).
  const offline = !navigator.onLine
  if (
    vehicleView.status === 'loading' ||
    trips.status === 'loading' ||
    (vehicleView.status === 'ready' && trips.status === 'idle')
  ) {
    return <LoadingBanner />
  }
  if (vehicleView.status === 'error' && !offline) {
    return (
      <ErrorBanner
        message={vehicleView.error?.message ?? 'Erreur de chargement.'}
        onRetry={() => void vehicleView.reload()}
      />
    )
  }
  if (trips.status === 'error' && !offline) {
    return (
      <ErrorBanner
        message={trips.error?.message ?? 'Erreur de chargement.'}
        onRetry={() => void trips.reload()}
      />
    )
  }

  const openEntry = trips.openTrip
  const openAuthorId = openEntry?.startReading?.userId ?? null
  const openByOther =
    openEntry !== null && openAuthorId !== null && openAuthorId !== user?.id
  // Clôturer/annuler : auteur du départ ou admin (D33). Un membre face à la
  // sortie ouverte d'autrui démarrera EN RELAIS, avec confirmation (D35).
  const canManage = openEntry !== null && (!openByOther || isAdmin)

  const hint = openEntry
    ? null
    : trips.lastReading
      ? `Dernier relevé connu : ${formatKm(trips.lastReading.km)} km.`
      : offline
        ? 'Hors-ligne — la sortie sera mise en file puis synchronisée au retour du réseau.'
        : 'Première sortie de ce véhicule.'

  const relay =
    openEntry && openByOther
      ? {
          authorLabel: labelOf(openAuthorId),
          startedAt:
            openEntry.startReading?.readingAt ?? openEntry.trip.createdAt,
        }
      : null

  return (
    <div className="grid gap-4">
      {feedback && (
        <FeedbackBanner
          feedback={feedback}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {openEntry && (
        <OpenTripCard
          entry={openEntry}
          authorLabel={openAuthorId ? labelOf(openAuthorId) : 'auteur inconnu'}
          canManage={canManage}
          offline={offline}
          onComplete={(end) => trips.completeTrip(openEntry.trip.id, end)}
          onCancel={async (tripId) => (await trips.cancelTrip(tripId)) ?? null}
          onFeedback={setFeedback}
        />
      )}

      {(!openEntry || !canManage) && (
        <StartTripForm
          hint={hint ?? 'Démarrer ferait relais sur la sortie en cours (D35).'}
          relay={relay}
          onStart={(input) => trips.startTrip(input)}
          onFeedback={setFeedback}
        />
      )}
    </div>
  )
}
