// Profiles : accès généraux aux profils (D22) — affichage des utilisateurs
// (historique, filtre admin). La lecture du rôle de SA session vit dans
// authRepository, pas ici. La conversion des lignes est la compétence du
// schéma zod (D26), qui porte aussi la règle D8 « jamais de promotion ».
import { supabase } from '@/lib/supabase'
import { toDataError } from '@/repositories/errors'
import {
  profileRowSchema,
  type Profile,
  type ProfileRowInput,
} from '@/schemas/profiles'

// Le paramètre est la forme attendue par le schéma : si une colonne disparaît
// ou change de type côté base (type généré D24), le mapping refuse de compiler.
function toProfile(row: ProfileRowInput): Profile {
  return profileRowSchema.parse(row)
}

/** La policy RLS autorise la lecture des profils par tout authentifié. */
export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, email, created_at')
    .order('created_at')
  if (error) throw toDataError(error)
  return (data ?? []).map(toProfile)
}

export async function getProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, email, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw toDataError(error)
  return data ? toProfile(data) : null
}
