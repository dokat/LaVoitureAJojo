// Écran « items en attente » (milestone 7, D13) : vitrine de la file
// IndexedDB. Chaque item porte son état — « en attente » ou « en attente —
// conflit » avec le message de la base — et deux issues explicites :
// modifier (re-synchronise) ou abandonner (confirmé, jamais silencieux).
// La photo est un Blob local : aperçu via object URL, jamais une signed URL.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { usePendingQueue } from '@/hooks/usePendingQueue'
import type { PendingIntent, PendingReading } from '@/hooks/usePendingQueue'
import { compressPhoto } from '@/lib/images'
import {
  formatDateTime,
  formatKm,
  fromInputDateTimeLocal,
  toInputDateTimeLocal,
} from '@/lib/format'

function PhotoThumb({ photo }: { photo: Blob | null }) {
  const url = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  )
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  if (!url) return null
  return (
    <img
      src={url}
      alt="Photo en attente"
      className="max-h-24 rounded-lg object-contain ring-1 ring-foreground/10"
    />
  )
}

function EditDialog({ item }: { item: PendingReading }) {
  const { editItem } = usePendingQueue()
  const [open, setOpen] = useState(false)
  const [km, setKm] = useState(String(item.km))
  const [readingAt, setReadingAt] = useState(() =>
    toInputDateTimeLocal(new Date(item.readingAt)),
  )
  const [fuel, setFuel] = useState(
    item.fuelPercent === null ? '' : String(item.fuelPercent),
  )
  const [notes, setNotes] = useState(item.notes ?? '')
  const [newPhoto, setNewPhoto] = useState<File | null>(null)
  const [dropPhoto, setDropPhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const kmNumber = Number(km)
    if (!Number.isInteger(kmNumber) || kmNumber < 0) {
      setError('Le kilométrage doit être un entier positif ou nul.')
      return
    }
    const date = fromInputDateTimeLocal(readingAt)
    if (Number.isNaN(date.getTime())) {
      setError('La date du relevé est invalide.')
      return
    }
    const fuelNumber = fuel.trim() === '' ? null : Number(fuel)
    if (
      fuelNumber !== null &&
      (!Number.isInteger(fuelNumber) || fuelNumber < 0 || fuelNumber > 100)
    ) {
      setError('Le niveau d’essence doit être un entier entre 0 et 100.')
      return
    }
    try {
      // Photo : on remplace par un blob compressé (D16) si un nouveau
      // fichier est choisi ; la compression locale fonctionne hors-ligne.
      let photo = dropPhoto ? null : item.photo
      if (newPhoto) photo = (await compressPhoto(newPhoto)).blob
      await editItem(item.id, {
        km: kmNumber,
        readingAt: date.toISOString(),
        fuelPercent: fuelNumber,
        notes: notes.trim() === '' ? null : notes.trim(),
        photo,
      })
      setOpen(false)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Modification impossible.',
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le relevé en attente</DialogTitle>
          <DialogDescription>
            La correction repart en synchronisation immédiatement.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={save}>
          <div className="grid gap-2">
            <Label htmlFor={`km-${item.id}`}>Kilométrage (km)</Label>
            <Input
              id={`km-${item.id}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="tabular-nums"
              value={km}
              onChange={(event) => setKm(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`date-${item.id}`}>Date du relevé</Label>
            <Input
              id={`date-${item.id}`}
              type="datetime-local"
              value={readingAt}
              onChange={(event) => setReadingAt(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`fuel-${item.id}`}>
              Essence restante (%) — optionnel
            </Label>
            <Input
              id={`fuel-${item.id}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="tabular-nums"
              value={fuel}
              onChange={(event) => setFuel(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`notes-${item.id}`}>Notes — optionnel</Label>
            <Textarea
              id={`notes-${item.id}`}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`photo-${item.id}`}>Photo</Label>
            <PhotoThumb photo={dropPhoto ? null : item.photo} />
            {(item.photo || newPhoto) && !dropPhoto && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit text-muted-foreground"
                onClick={() => {
                  setDropPhoto(true)
                  setNewPhoto(null)
                }}
              >
                Retirer la photo
              </Button>
            )}
            <Input
              id={`photo-${item.id}`}
              type="file"
              accept="image/*"
              capture="environment"
              className="text-sm"
              onChange={(event) => {
                setNewPhoto(event.target.files?.[0] ?? null)
                setDropPhoto(false)
              }}
            />
            {dropPhoto && item.photo && (
              <p className="text-xs text-muted-foreground">
                La photo sera retirée de l’item (le relevé partira sans photo).
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" className="w-full">
              Enregistrer et synchroniser
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// D39 : un item de file peut porter une INTENTION sortie, pas seulement un
// relevé. Le libellé branching est la part M10 de l'écran ; le formulaire de
// sortie complet (ouverture, clôture, relais confirmé) est le sujet du M11.
const INTENT_LABEL: Record<PendingIntent, string> = {
  reading: 'Relevé',
  tripOpen: 'Sortie — ouverture',
  tripClose: 'Sortie — clôture',
  tripCancel: 'Sortie — annulation',
}

const intentOf = (item: PendingReading): PendingIntent =>
  item.intent ?? 'reading'

function PendingRow({ item }: { item: PendingReading }) {
  const { discardItem } = usePendingQueue()
  const intent = intentOf(item)
  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-2xl tabular-nums">
            {intent === 'tripCancel' ? (
              <span className="text-base font-medium">
                Annulation de sortie
              </span>
            ) : (
              `${formatKm(item.km)} km`
            )}
          </CardTitle>
          {item.status === 'conflict' ? (
            <Badge variant="destructive">En attente — conflit</Badge>
          ) : (
            <Badge variant="secondary">En attente</Badge>
          )}
        </div>
        {intent !== 'reading' && (
          <CardDescription className="text-xs font-medium">
            {INTENT_LABEL[intent]}
          </CardDescription>
        )}
        <CardDescription>
          {intent === 'tripCancel' ? (
            <>
              Annulation · en file depuis le{' '}
              {formatDateTime(new Date(item.createdAt))}
            </>
          ) : (
            <>
              {intent === 'reading'
                ? 'Relevé'
                : intent === 'tripOpen'
                  ? 'Départ'
                  : 'Arrivée'}{' '}
              du {formatDateTime(new Date(item.readingAt))} · en file depuis le{' '}
              {formatDateTime(new Date(item.createdAt))}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm text-muted-foreground">
        {item.lastError && (
          <p role="alert" className="text-destructive">
            {item.lastError}
          </p>
        )}
        {intent === 'tripOpen' && item.endKm != null && item.endReadingAt && (
          <p>
            Arrivée prévue : {formatKm(item.endKm)} km du{' '}
            {formatDateTime(new Date(item.endReadingAt))} (sortie née
            rétroactive, D31).
          </p>
        )}
        {intent === 'tripClose' && item.tripId && (
          <p>Cet envoi clôturera la sortie ciblée à la synchronisation.</p>
        )}
        {item.insertedReadingId && (
          <p>
            {intent === 'reading'
              ? 'Le relevé est déjà passé en base : seule la photo attend encore son envoi.'
              : 'Le relevé associé est déjà passé en base : seule la suite attend le réseau.'}
          </p>
        )}
        {item.fuelPercent !== null && <p>Essence : {item.fuelPercent} %</p>}
        {item.notes && <p className="italic">« {item.notes} »</p>}
        <PhotoThumb photo={item.photo} />
      </CardContent>
      <CardFooter className="gap-2">
        {intent !== 'tripCancel' && <EditDialog item={item} />}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive">
              Abandonner
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {intent === 'tripCancel'
                  ? 'Abandonner cette annulation ?'
                  : 'Abandonner ce relevé ?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {intent === 'tripCancel'
                  ? 'La sortie restera ouverte (la demande d’annulation sera supprimée de cet appareil sans être envoyée). Cette action est définitive.'
                  : `${formatKm(item.km)} km du ${formatDateTime(
                      new Date(item.readingAt),
                    )} seront supprimés de cet appareil sans être envoyés. ${
                      intent === 'tripOpen'
                        ? 'C’est l’ouverture de sortie entière qui sera abandonnée. '
                        : ''
                    }Cette action est définitive.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => void discardItem(item.id)}>
                Abandonner
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  )
}

export function PendingPage() {
  const { items, online, syncing, syncNow } = usePendingQueue()
  return (
    <div className="grid gap-3">
      <CardHeader>
        <CardTitle>Items en attente</CardTitle>
        <CardDescription>
          Les relevés saisis hors-ligne partent à la première connexion.
        </CardDescription>
      </CardHeader>

      {!online && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <CloudOff className="size-4 shrink-0" />
          Hors-ligne — la saisie fonctionne, la synchronisation attend le
          réseau.
        </p>
      )}

      <Button
        variant="outline"
        className="w-full"
        onClick={() => void syncNow()}
        disabled={syncing || items.length === 0}
      >
        <RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />
        {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
      </Button>

      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Rien en attente — tout est synchronisé.
        </p>
      )}
      {items.map((item) => (
        <PendingRow key={item.id} item={item} />
      ))}
    </div>
  )
}
