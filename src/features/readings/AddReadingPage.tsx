// Formulaire de saisie mobile-first (D11/D5) : clavier numérique pour le km,
// date pré-remplie à « maintenant » et éditable (D14), % essence et notes
// optionnels, photo via caméra directe (input capture, D16). La validation D6
// est demandée au hook AVANT envoi (le trigger SQL garde la vérité en base) ;
// l'upload échoué n'annule jamais le relevé (message D25).
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useOdometerValidation } from '@/hooks/useOdometerValidation'
import { useReadings } from '@/hooks/useReadings'
import {
  formatKm,
  fromInputDateTimeLocal,
  toInputDateTimeLocal,
} from '@/lib/format'

export function AddReadingPage() {
  const { status, lastReading, addReading } = useReadings()
  const validate = useOdometerValidation(lastReading)

  const [km, setKm] = useState('')
  const [readingAt, setReadingAt] = useState(() =>
    toInputDateTimeLocal(new Date()),
  )
  const [fuel, setFuel] = useState('')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [photoWarning, setPhotoWarning] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ km: number; queued: boolean } | null>(
    null,
  )

  const previewUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  )
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  if (status === 'loading') {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Chargement…
      </p>
    )
  }

  if (saved) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Relevé enregistré</CardTitle>
          <CardDescription>
            {saved.queued
              ? `${formatKm(saved.km)} km mis en file : hors-ligne, la synchronisation partira au retour du réseau (file visible dans « En attente »).`
              : `${formatKm(saved.km)} km ajoutés à l’historique.`}
          </CardDescription>
        </CardHeader>
        {photoWarning && (
          <CardContent>
            <p role="alert" className="text-sm text-destructive">
              {photoWarning}
            </p>
          </CardContent>
        )}
        <CardFooter className="gap-2">
          <Button asChild variant="outline" className="flex-1">
            <Link to="/">Dashboard</Link>
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setSaved(null)
              setPhotoWarning(null)
              setKm('')
              setFuel('')
              setNotes('')
              setPhoto(null)
              setReadingAt(toInputDateTimeLocal(new Date()))
            }}
          >
            Nouveau relevé
          </Button>
        </CardFooter>
      </Card>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const candidateKm = Number(km)
    const candidateDate = fromInputDateTimeLocal(readingAt)
    const verdict = validate({ km: candidateKm, readingAt: candidateDate })
    if (!verdict.ok) {
      setFormError(verdict.message)
      return
    }
    const fuelNumber = fuel.trim() === '' ? null : Number(fuel)
    if (
      fuelNumber !== null &&
      (!Number.isInteger(fuelNumber) || fuelNumber < 0 || fuelNumber > 100)
    ) {
      setFormError('Le niveau d’essence doit être un entier entre 0 et 100.')
      return
    }
    setSaving(true)
    const result = await addReading({
      km: candidateKm,
      readingAt: candidateDate,
      fuelPercent: fuelNumber,
      notes: notes.trim() === '' ? null : notes.trim(),
      photo,
    })
    setSaving(false)
    if (result.ok) {
      if ('queued' in result) {
        // D13 : pas de réseau — la saisie attend dans la file IndexedDB.
        setSaved({ km: candidateKm, queued: true })
        return
      }
      // D25 : le relevé est en base même si les octets de la photo n'ont pas
      // suivi — on le dit à l'utilisateur, rien n'est perdu en silence.
      setPhotoWarning(
        result.photoError
          ? `Relevé enregistré, mais la photo n’a pas pu être envoyée : ${result.photoError.message}`
          : null,
      )
      setSaved({ km: result.reading.km, queued: false })
    } else {
      setFormError(result.error.message)
    }
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Nouveau relevé</CardTitle>
          <CardDescription>
            {lastReading
              ? `Dernier relevé connu : ${formatKm(lastReading.km)} km.`
              : 'Premier relevé de ce véhicule.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="km">Kilométrage (km)</Label>
            <Input
              id="km"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoFocus
              required
              className="text-lg tabular-nums"
              value={km}
              onChange={(event) => setKm(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reading-at">Date du relevé</Label>
            <Input
              id="reading-at"
              type="datetime-local"
              required
              value={readingAt}
              onChange={(event) => setReadingAt(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fuel">Essence restante (%) — optionnel</Label>
            <Input
              id="fuel"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="ex. 75"
              className="tabular-nums"
              value={fuel}
              onChange={(event) => setFuel(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="photo">Photo — optionnelle</Label>
            <Input
              id="photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="text-sm"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Aperçu de la photo choisie"
                className="max-h-40 rounded-lg object-contain ring-1 ring-foreground/10"
              />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes — optionnel</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer le relevé'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
