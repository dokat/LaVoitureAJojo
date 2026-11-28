// D44 : sélecteur du véhicule affiché — le choix de CE NAVIGATEUR, changé ici
// pour cet appareil seulement (aucune écriture base). Le label et les options
// vivent dans un SelectGroup : Radix l'exige, SelectLabel hors groupe lève
// « `SelectLabel` must be used within `SelectGroup` ».
import { Car } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Vehicle } from '@/schemas/vehicles'

interface VehicleSelectProps {
  vehicle: Vehicle
  fleet: Vehicle[]
  onSelect: (vehicleId: string) => void
}

export function VehicleSelect({
  vehicle,
  fleet,
  onSelect,
}: VehicleSelectProps) {
  return (
    <Select value={vehicle.id} onValueChange={onSelect}>
      <SelectTrigger
        size="sm"
        aria-label="Choisir le véhicule de ce navigateur"
        title={`${vehicle.brand} ${vehicle.model}`}
        className="h-auto min-w-0 flex-1 justify-start gap-1 border-0 bg-transparent px-1 text-xs font-normal text-muted-foreground shadow-none"
      >
        <Car className="size-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Véhicules (choix de ce navigateur)</SelectLabel>
          {fleet.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.brand} {option.model}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
