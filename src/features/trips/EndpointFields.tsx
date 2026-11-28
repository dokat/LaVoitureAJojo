// Champs d'une extrémité de sortie (D32) : km (clavier numérique), date
// éditable pré-remplie « maintenant » (D14), % essence, photo (caméra directe,
// input capture, D16) et notes — miroir exact de l'ancien formulaire de relevé
// brut (supprimé en M11, D31), partagé par « Démarrer » (bloc départ, bloc
// arrivée rétroactif) et « Terminer ». La validation de forme vit dans
// `endpointForm.ts` ; D6 et D34 sont demandées au hook `useTrips` avant envoi
// — la base garde la vérité.
import { useEffect, useMemo, type ChangeEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { EndpointFormValue } from '@/features/trips/endpointForm'

export function EndpointFields({
  idPrefix,
  kmLabel,
  value,
  onChange,
}: {
  /** Préfixe d'id — deux blocs sur la même page (rétro-saisie) ⇒ ids uniques. */
  idPrefix: string
  kmLabel: string
  value: EndpointFormValue
  onChange: (next: EndpointFormValue) => void
}) {
  const previewUrl = useMemo(
    () => (value.photo ? URL.createObjectURL(value.photo) : null),
    [value.photo],
  )
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-km`}>{kmLabel}</Label>
        <Input
          id={`${idPrefix}-km`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          required
          className="text-lg tabular-nums"
          value={value.km}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onChange({ ...value, km: event.target.value })
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-at`}>Date du relevé</Label>
        <Input
          id={`${idPrefix}-at`}
          type="datetime-local"
          required
          value={value.readingAt}
          onChange={(event) =>
            onChange({ ...value, readingAt: event.target.value })
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-fuel`}>
          Essence restante (%) — optionnel
        </Label>
        <Input
          id={`${idPrefix}-fuel`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="ex. 75"
          className="tabular-nums"
          value={value.fuel}
          onChange={(event) => onChange({ ...value, fuel: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-photo`}>Photo — optionnelle</Label>
        <Input
          id={`${idPrefix}-photo`}
          type="file"
          accept="image/*"
          capture="environment"
          className="text-sm"
          onChange={(event) =>
            onChange({ ...value, photo: event.target.files?.[0] ?? null })
          }
        />
        {previewUrl && (
          <div className="grid gap-1">
            <img
              src={previewUrl}
              alt="Aperçu de la photo choisie"
              className="max-h-40 rounded-lg object-contain ring-1 ring-foreground/10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit text-xs text-muted-foreground"
              onClick={() => onChange({ ...value, photo: null })}
            >
              Retirer la photo
            </Button>
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-notes`}>Notes — optionnel</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={2}
          value={value.notes}
          onChange={(event) =>
            onChange({ ...value, notes: event.target.value })
          }
        />
      </div>
    </div>
  )
}
