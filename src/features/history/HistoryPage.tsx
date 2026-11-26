// Historique (M5 + M6) : liste chronologique inversée, photo cliquable (URL
// signée, D16). Milestone 6 : actions de suppression douce par ligne (auteur
// ou admin) et contrôles admin — toggle « voir les suppressions » (D7) et
// filtre « par utilisateur » (D8). Un membre ne voit jamais ces contrôles :
// l'UI reflète la RLS, elle ne la remplace pas.
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
import { useAuth } from '@/hooks/useAuth'
import { useProfiles } from '@/hooks/useProfiles'
import { useReadings } from '@/hooks/useReadings'
import { ReadingRow } from '@/features/history/ReadingRow'

export function HistoryPage() {
  const { user, isAdmin } = useAuth()
  const [showDeleted, setShowDeleted] = useState(false)
  const [filterUserId, setFilterUserId] = useState<string | null>(null)
  const { profiles, labelOf } = useProfiles()

  // Garde-fou tâche 4 : les filtres admin ne sont effectifs que pour un admin,
  // y compris si l'état local a été posé avant une rétrogradation de rôle.
  const { status, error, readings, softDelete, restore, reload } = useReadings({
    includeDeleted: isAdmin && showDeleted,
    userId: isAdmin ? filterUserId : null,
  })

  const liveCount = useMemo(
    () => readings.filter((r) => r.deletedAt === null).length,
    [readings],
  )

  if (status === 'loading') {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Chargement…
      </p>
    )
  }
  if (status === 'error') {
    return (
      <div className="grid gap-3 py-8 text-center">
        <p role="alert" className="text-sm text-destructive">
          {error?.message ?? 'Erreur de chargement.'}
        </p>
        <Button variant="outline" onClick={() => void reload()}>
          Réessayer
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <CardHeader>
        <CardTitle>Historique</CardTitle>
        <CardDescription>
          {liveCount} relevé{liveCount > 1 ? 's' : ''}
          {showDeleted && isAdmin
            ? ` (+ ${readings.length - liveCount} supprimé${readings.length - liveCount > 1 ? 's' : ''})`
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
              Voir les suppressions
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

      {readings.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucun relevé pour l’instant.
        </p>
      )}
      {readings.map((reading) => (
        <ReadingRow
          key={reading.id}
          reading={reading}
          actions={{
            canDelete: reading.userId === user?.id || isAdmin,
            canRestore: isAdmin,
            authorLabel: isAdmin ? labelOf(reading.userId) : undefined,
            onDelete: async (id) => (await softDelete(id))?.message ?? null,
            onRestore: async (id) => (await restore(id))?.message ?? null,
          }}
        />
      ))}
    </div>
  )
}
