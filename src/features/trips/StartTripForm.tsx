// Formulaire « Démarrer une sortie » (D31) : bloc départ (km, date éditable
// pré-remplie « maintenant » — D14, photo/essence/notes optionnels — D32) et
// repli rétroactif : l'interrupteur ajoute le bloc arrivée, la sortie naît
// alors clôturée. Relais (D35) : quand une sortie ouverte PAR AUTRUI est
// chargée, l'envoi est précédé d'une confirmation explicite (alert-dialog,
// « votre relevé clôturera la sortie en cours de X ») et les refus D34/D6
// remontent en messages typés portés par `useTrips` — jamais de blocage
// silencieux.
import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { StartTripResult, TripEndpointInput } from '@/hooks/useTrips'
import { formatDateTime } from '@/lib/format'
import { EndpointFields } from '@/features/trips/EndpointFields'
import {
  freshEndpointForm,
  parseEndpointForm,
  type EndpointFormValue,
} from '@/features/trips/endpointForm'
import type { TripFeedback } from '@/features/trips/feedback'

export type RelayNotice = {
  /** Libellé de l'auteur de la sortie ouverte (email — D27). */
  authorLabel: string
  /** Date du relevé de départ de cette sortie. */
  startedAt: Date
}

export function StartTripForm({
  hint,
  relay,
  onStart,
  onFeedback,
}: {
  hint: string
  relay: RelayNotice | null
  onStart: (input: {
    start: TripEndpointInput
    end?: TripEndpointInput
  }) => Promise<StartTripResult>
  onFeedback: (feedback: TripFeedback) => void
}) {
  const [start, setStart] = useState<EndpointFormValue>(freshEndpointForm)
  const [retroactive, setRetroactive] = useState(false)
  const [end, setEnd] = useState<EndpointFormValue>(freshEndpointForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Inputs déjà validés, en attente de confirmation du relais (D35).
  const pending = useRef<{
    start: TripEndpointInput
    end?: TripEndpointInput
  } | null>(null)

  const send = async (input: {
    start: TripEndpointInput
    end?: TripEndpointInput
  }) => {
    pending.current = null
    setConfirming(false)
    setSaving(true)
    const result = await onStart(input)
    setSaving(false)
    if (!result.ok) {
      // D6, D34, relais refusé : message typé — l'utilisateur corrige.
      setError(result.error.message)
      return
    }
    setStart(freshEndpointForm())
    setEnd(freshEndpointForm())
    setRetroactive(false)
    if ('queued' in result) {
      onFeedback({
        tone: 'queued',
        text: 'Hors-ligne : ouverture de sortie mise en file — elle partira à la première connexion (D39).',
      })
    } else if (result.photoError) {
      onFeedback({
        tone: 'warn',
        text: `Sortie enregistrée, mais la photo n’a pas pu être envoyée : ${result.photoError.message}`,
      })
    } else if (input.end) {
      onFeedback({
        tone: 'ok',
        text: 'Sortie rétroactive enregistrée : elle naît clôturée (D31).',
      })
    } else {
      // En ligne, sans arrivée : la page bascule sur la carte « Sortie en
      // cours » — le formulaire courant disparaît, pas de message à porter.
      onFeedback(null)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const parsedStart = parseEndpointForm(start)
    if (!parsedStart.ok) {
      setError(parsedStart.message)
      return
    }
    let parsedEnd: TripEndpointInput | undefined
    if (retroactive) {
      const parsed = parseEndpointForm(end)
      if (!parsed.ok) {
        setError(`Arrivée : ${parsed.message}`)
        return
      }
      parsedEnd = parsed.input
    }
    if (relay) {
      // D35 : confirmation explicite AVANT envoi — le relais clôturera la
      // sortie d'autrui avec CE relevé de départ.
      pending.current = { start: parsedStart.input, end: parsedEnd }
      setConfirming(true)
      return
    }
    void send({ start: parsedStart.input, end: parsedEnd })
  }

  return (
    <>
      <form onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle>Démarrer une sortie</CardTitle>
            <CardDescription>{hint}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {relay && (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Sortie en cours de {relay.authorLabel} depuis le{' '}
                {formatDateTime(relay.startedAt)} : votre relevé de départ la
                clôturera (relais, D35).
              </p>
            )}
            <EndpointFields
              idPrefix="start"
              kmLabel="Kilométrage au départ (km)"
              value={start}
              onChange={setStart}
            />
            <div className="flex items-center gap-2">
              <Switch
                id="retroactive"
                checked={retroactive}
                onCheckedChange={setRetroactive}
              />
              <Label htmlFor="retroactive" className="text-sm font-normal">
                Cette sortie est déjà terminée — renseigner aussi l’arrivée
                (D31)
              </Label>
            </div>
            {retroactive && (
              <div className="grid gap-3">
                <span className="text-sm font-medium">Arrivée</span>
                <EndpointFields
                  idPrefix="end"
                  kmLabel="Kilométrage à l’arrivée (km)"
                  value={end}
                  onChange={setEnd}
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving
                ? 'Enregistrement…'
                : relay
                  ? 'Clôturer la sortie en cours et démarrer'
                  : 'Démarrer la sortie'}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clôturer la sortie de {relay?.authorLabel} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Votre relevé clôturera la sortie en cours de {relay?.authorLabel}
              {relay ? `, ouverte le ${formatDateTime(relay.startedAt)}` : ''} —
              le même relevé servira d’arrivée à cette sortie et de départ à la
              vôtre (D35).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revenir</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending.current) void send(pending.current)
              }}
            >
              Confirmer le relais
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
