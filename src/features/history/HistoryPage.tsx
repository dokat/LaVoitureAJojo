// Historique PAR SORTIE (D38, milestone 11) : une ligne = une sortie (départ →
// arrivée, distance, auteurs). Milestone 6 repris : contrôles admin visibles
// des seuls admins — toggle « voir les suppressions », qui inclut désormais
// les sorties ANNULÉES (D36), et filtre « par utilisateur » (D8), appliqué à
// l'auteur du départ. Un membre ne voit jamais les lignes mortes : la liste
// est filtrée à l'affichage (la base autorise la lecture, D27). Les actions
// sont par agrégat (D33/D37), jamais par relevé isolé.
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActiveVehicle } from '@/hooks/useActiveVehicle'
import { useAuth } from '@/hooks/useAuth'
import { useProfiles } from '@/hooks/useProfiles'
import { isLiveTrip, useTrips } from '@/hooks/useTrips'
import { TripRow } from '@/features/history/TripRow'

export function HistoryPage() {
  const { user, isAdmin } = useAuth()
  const [showDeleted, setShowDeleted] = useState(false)
  const [filterUserId, setFilterUserId] = useState<string | null>(null)
  const vehicleView = useActiveVehicle()
  const { profiles, labelOf } = useProfiles()

  // Le hook charge TOUJOURS les mortes (jonction des sorties supprimées, D37) ;
  // le filtre admin n'est donc qu'affichage — garde-fou : effectif pour un
  // admin seulement, même si l'état local a survécu à une rétrogradation.
  const trips = useTrips(vehicleView.vehicle?.id ?? null)

  const visible = useMemo(() => {
    let entries = trips.entries
    if (!isAdmin || !showDeleted) {
      entries = entries.filter(isLiveTrip)
    }
    if (isAdmin && filterUserId) {
      entries = entries.filter(
        (entry) => entry.startReading?.userId === filterUserId,
      )
    }
    return entries
  }, [trips.entries, isAdmin, showDeleted, filterUserId])

  const liveCount = useMemo(
    () => trips.entries.filter((entry) => isLiveTrip(entry)).length,
    [trips.entries],
  )
  const deadCount = trips.entries.length - liveCount

  // Le hook passe par « idle » tant que le véhicule n'est pas résolu, puis
  // charge sans repasser par « loading » : on traite ce moment comme un
  // chargement (sinon l'écran vide clignote avant la première liste).
  if (
    vehicleView.status === 'loading' ||
    trips.status === 'loading' ||
    (vehicleView.status === 'ready' && trips.status === 'idle')
  ) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Chargement…
      </p>
    )
  }
  if (vehicleView.status === 'error') {
    return (
      <div className="grid gap-3 py-8 text-center">
        <p role="alert" className="text-sm text-destructive">
          {vehicleView.error?.message ?? 'Erreur de chargement.'}
        </p>
        <Button variant="outline" onClick={() => void vehicleView.reload()}>
          Réessayer
        </Button>
      </div>
    )
  }
  if (trips.status === 'error') {
    return (
      <div className="grid gap-3 py-8 text-center">
        <p role="alert" className="text-sm text-destructive">
          {trips.error?.message ?? 'Erreur de chargement.'}
        </p>
        <Button variant="outline" onClick={() => void trips.reload()}>
          Réessayer
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <CardHeader>
        <CardTitle>Historique des sorties</CardTitle>
        <CardDescription>
          {visible.length} sortie{visible.length > 1 ? 's' : ''}
          {showDeleted && isAdmin && deadCount > 0
            ? ` — dont ${deadCount} masquée${deadCount > 1 ? 's' : ''} pour les membres`
            : ''}
        </CardDescription>
      </CardHeader>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2">
          <div className="flex items-center gap-2">
            <Switch
              id="show-deleted"
              checked={showDeleted}
              onCheckedChange={setShowDeleted}
            />
            <Label htmlFor="show-deleted" className="text-sm font-normal">
              Voir les suppressions et annulations
            </Label>
          </div>
          <Select
            value={filterUserId ?? 'all'}
            onValueChange={(value) =>
              setFilterUserId(value === 'all' ? null : value)
            }
          >
            <SelectTrigger size="sm" className="w-auto gap-1">
              <SelectValue placeholder="Tous les utilisateurs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les utilisateurs</SelectItem>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.email ?? `utilisateur ${profile.id.slice(0, 8)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {visible.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucune sortie pour l’instant — tout se passe ici, au rythme des
          départs et des arrivées.
        </p>
      )}
      {visible.map((entry) => (
        <TripRow
          key={entry.trip.id}
          entry={entry}
          actions={{
            canManage:
              isAdmin ||
              (entry.startReading !== null &&
                entry.startReading.userId === user?.id),
            canRestore: isAdmin,
            labelOf,
            onCancel: async (tripId) =>
              (await trips.cancelTrip(tripId))?.message ?? null,
            onDelete: async (tripId) =>
              (await trips.deleteTrip(tripId))?.message ?? null,
            onRestore: async (tripId) =>
              (await trips.restoreTrip(tripId))?.message ?? null,
          }}
        />
      ))}
    </div>
  )
}
