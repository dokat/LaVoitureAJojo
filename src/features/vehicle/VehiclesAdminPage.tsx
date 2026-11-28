// Écran d'administration des véhicules (D8, milestone 6), réservé admin (route
// gardée par RequireAdmin) : édition des infos (marque, modèle, plaque). La
// bascule du véhicule actif a disparu d'ici (D44) : le véhicule courant est le
// choix de chaque navigateur, porté par l'en-tête de l'app. La flotte naît du
// seed et ne meurt pas en v1 : pas d'ajout/suppression ici.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
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
import { useVehicles, type VehicleInfo } from '@/hooks/useVehicles'
import type { DataError } from '@/repositories/errors'
import type { Vehicle } from '@/schemas/vehicles'

function EditVehicleDialog({
  vehicle,
  onSave,
}: {
  vehicle: Vehicle
  onSave: (vehicleId: string, info: VehicleInfo) => Promise<DataError | null>
}) {
  const [open, setOpen] = useState(false)
  const [brand, setBrand] = useState(vehicle.brand)
  const [model, setModel] = useState(vehicle.model)
  const [plate, setPlate] = useState(vehicle.plate)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Le formulaire se resynchronise sur la ligne à chaque ouverture : l'état
  // peut avoir changé entre-temps (autre onglet, autre admin).
  const reopen = (nextOpen: boolean) => {
    if (nextOpen) {
      setBrand(vehicle.brand)
      setModel(vehicle.model)
      setPlate(vehicle.plate)
      setMessage(null)
    }
    setOpen(nextOpen)
  }

  const save = async () => {
    const trimmed = {
      brand: brand.trim(),
      model: model.trim(),
      plate: plate.trim(),
    }
    if (!trimmed.brand || !trimmed.model || !trimmed.plate) {
      setMessage('Marque, modèle et plaque sont obligatoires.')
      return
    }
    setSaving(true)
    const failure = await onSave(vehicle.id, trimmed)
    setSaving(false)
    if (failure) setMessage(failure.message)
    else setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={reopen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Informations du véhicule</DialogTitle>
          <DialogDescription>
            {vehicle.brand} {vehicle.model} — visibles de tous les membres.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`brand-${vehicle.id}`}>Marque</Label>
            <Input
              id={`brand-${vehicle.id}`}
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`model-${vehicle.id}`}>Modèle</Label>
            <Input
              id={`model-${vehicle.id}`}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`plate-${vehicle.id}`}>Plaque</Label>
            <Input
              id={`plate-${vehicle.id}`}
              value={plate}
              onChange={(event) => setPlate(event.target.value)}
              className="uppercase"
            />
          </div>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function VehiclesAdminPage() {
  const { status, error, vehicles, saveVehicleInfo, reload } = useVehicles()
  return (
    <div className="grid gap-4">
      <CardHeader className="p-0">
        <CardTitle>Administration — Véhicules</CardTitle>
        <CardDescription>
          Informations de la flotte, visibles de tous les membres. Le véhicule
          sur lequel on saisit est le choix de chaque navigateur (en-tête de
          l’app), plus un réglage admin (D44).
        </CardDescription>
      </CardHeader>

      {status === 'loading' && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Chargement…
        </p>
      )}
      {status === 'error' && (
        <div className="grid gap-3 py-8 text-center">
          <p role="alert" className="text-sm text-destructive">
            {error?.message ?? 'Erreur de chargement.'}
          </p>
          <Button variant="outline" onClick={() => void reload()}>
            Réessayer
          </Button>
        </div>
      )}
      {status === 'ready' && (
        <div className="grid gap-2">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} size="sm">
              <CardContent className="flex flex-wrap items-center gap-2">
                <div className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">
                    {vehicle.brand} {vehicle.model}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {vehicle.plate}
                  </span>
                </div>
                <EditVehicleDialog vehicle={vehicle} onSave={saveVehicleInfo} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
