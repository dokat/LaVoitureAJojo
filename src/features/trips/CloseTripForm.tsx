// Formulaire « Terminer » d'une sortie en cours : relevé d'arrivée (km, date
// — D14, photo/essence/notes — D32). Les validations D6 (contre le dernier
// relevé) et D34 (contre le départ) sont demandées au hook AVANT envoi ; les
// refus du trigger remontent en messages typés affichés ici. Hors-ligne, la
// clôture part en file (intention tripClose, D39).
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { CompleteTripResult, TripEndpointInput } from '@/hooks/useTrips'
import { EndpointFields } from '@/features/trips/EndpointFields'
import {
  freshEndpointForm,
  parseEndpointForm,
  type EndpointFormValue,
} from '@/features/trips/endpointForm'
import type { TripFeedback } from '@/features/trips/feedback'

export function CloseTripForm({
  startLabel,
  onComplete,
  onFeedback,
}: {
  /** Résumé du départ, rappelé au-dessus du formulaire (D34 : c'est l'appui). */
  startLabel: string
  onComplete: (end: TripEndpointInput) => Promise<CompleteTripResult>
  onFeedback: (feedback: TripFeedback) => void
}) {
  const [end, setEnd] = useState<EndpointFormValue>(freshEndpointForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const parsed = parseEndpointForm(end)
    if (!parsed.ok) {
      setError(parsed.message)
      return
    }
    setSaving(true)
    const result = await onComplete(parsed.input)
    setSaving(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setEnd(freshEndpointForm())
    if ('queued' in result) {
      onFeedback({
        tone: 'queued',
        text: 'Hors-ligne : clôture de sortie mise en file — elle partira à la première connexion (D39).',
      })
    } else if (result.photoError) {
      onFeedback({
        tone: 'warn',
        text: `Sortie clôturée, mais la photo n’a pas pu être envoyée : ${result.photoError.message}`,
      })
    } else {
      onFeedback({ tone: 'ok', text: 'Sortie terminée.' })
    }
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Terminer la sortie</CardTitle>
          <CardDescription>{startLabel}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <EndpointFields
            idPrefix="end"
            kmLabel="Kilométrage à l’arrivée (km)"
            value={end}
            onChange={setEnd}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Terminer la sortie'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
