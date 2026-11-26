// Storage photos (D16) : bucket privé `photos`, chemin objet
// {user_id}/{reading_id}.jpg. Le nom contient l'id du relevé → l'upload part
// APRÈS l'insertion SQL, puis le chemin est collé à la ligne (photo_path est
// la seule colonne non figée par le trigger D7 avec notes/fuel_percent).
import { supabase } from '@/lib/supabase'
import { toDataError } from '@/repositories/errors'

const BUCKET = 'photos'

/** Chemin canonique du bloc binaire (la policy d'insertion l'exige : dossier
 * = auth.uid()). */
export function photoPath(userId: string, readingId: string): string {
  return `${userId}/${readingId}.jpg`
}

/** Upload d'une photo déjà compressée côté client (lib/images.ts). */
export async function uploadPhoto(
  userId: string,
  readingId: string,
  blob: Blob,
): Promise<string> {
  const path = photoPath(userId, readingId)
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false, // les octets sont figés (D7) : jamais d'écrasement
  })
  if (error) throw toDataError(error)
  return path
}

/** URL temporaire pour afficher une photo privée (milestone 5, D16). */
export async function getSignedUrl(
  path: string,
  expiresIn = 10 * 60,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)
  if (error) throw toDataError(error)
  if (!data?.signedUrl) {
    throw toDataError(new Error('signed URL absente de la réponse storage'))
  }
  return data.signedUrl
}
