// Compression client des photos (D16) : plus long côté ramené à ~1600 px,
// réencodage JPEG ~80 % — ce réencodage retire les EXIF, donc tout GPS
// éventuel. Le fichier brut > 10 Mo est refusé AVANT tout traitement (le
// bucket garde la même limite, migration storage_photos).

/** Garde-fou D16 : 10 Mo, brut comme sortie (cohérent avec le bucket). */
export const MAX_RAW_BYTES = 10 * 1024 * 1024
/** Plus long côté cible après redimensionnement. */
export const MAX_DIMENSION = 1600
/** Qualité JPEG de réencodage. */
export const JPEG_QUALITY = 0.8

export type ImageErrorCode = 'too_large' | 'decode' | 'encode'

export class ImageError extends Error {
  readonly code: ImageErrorCode

  constructor(code: ImageErrorCode, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'ImageError'
    this.code = code
  }
}

export type CompressedPhoto = {
  /** Blob image/jpeg prêt pour storage (les octets ne sont pas en base64). */
  blob: Blob
  width: number
  height: number
}

/** Réduction à MAX_DIMENSION, jamais d'agrandissement ; bornée pour éviter
 * les panoramas démesurés. */
export function computeScaledSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= MAX_DIMENSION) return { width, height }
  const scale = MAX_DIMENSION / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Décode un blob image (File du formulaire ou item IndexedDB en hors-ligne),
 * le réduit et le réencode en JPEG. L'orientation EXIF est appliquée au
 * décodage puis les métadonnées disparaissent dans le réencodage (D16).
 */
export async function compressPhoto(source: Blob): Promise<CompressedPhoto> {
  if (source.size > MAX_RAW_BYTES) {
    throw new ImageError(
      'too_large',
      `Photo de ${Math.round(source.size / (1024 * 1024))} Mo : la limite est de 10 Mo.`,
    )
  }

  let bitmap: ImageBitmap
  try {
    // imageOrientation 'from-image' (défaut) : l'EXIF est appliqué au rendu.
    bitmap = await createImageBitmap(source)
  } catch (cause) {
    throw new ImageError(
      'decode',
      'Fichier image illisible — réessayez avec une photo.',
      cause,
    )
  }

  try {
    const size = computeScaledSize(bitmap.width, bitmap.height)
    const blob = await encodeJpeg(bitmap, size.width, size.height)
    if (blob.size > MAX_RAW_BYTES) {
      throw new ImageError(
        'too_large',
        'Image trop grande à encoder en JPEG dans la limite de 10 Mo.',
      )
    }
    return { blob, ...size }
  } finally {
    bitmap.close?.()
  }
}

async function encodeJpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageError('encode', 'Canvas indisponible.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  }
  // Chemin DOM (navigateurs sans OffscreenCanvas, et tests).
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageError('encode', 'Canvas indisponible.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new ImageError('encode', 'Échec de l\u2019encodage JPEG.')
  return blob
}
