// Compression client (D16) : garde-fou 10 Mo sur le brut, réduction à
// ~1600 px, sortie JPEG 80 % (le réencodage est ce qui retire les EXIF).
// Les briques canvas sont stubbées : le node de vitest n'a pas d'écran.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  computeScaledSize,
  compressPhoto,
  JPEG_QUALITY,
  MAX_DIMENSION,
  MAX_RAW_BYTES,
} from '@/lib/images'

// ── Doubles de test ─────────────────────────────────────────────────────────

const calls: { canvases: FakeCanvas[] } = { canvases: [] }
let encodeOverride: (() => Blob) | null = null

class FakeCanvas {
  readonly width: number
  readonly height: number
  readonly drawImage = vi.fn()
  readonly convertToBlob: ReturnType<typeof vi.fn>

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.convertToBlob = vi.fn(async () =>
      (encodeOverride ?? (() => blobOfSize(400 * 1024)))(),
    )
    calls.canvases.push(this)
  }

  getContext(type: string) {
    return type === '2d' ? { drawImage: this.drawImage } : null
  }
}

function blobOfSize(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
}

function stubImage(options: {
  width: number
  height: number
  decodeFails?: boolean
  encodedSize?: number
}) {
  const bitmap = {
    width: options.width,
    height: options.height,
    close: vi.fn(),
  }
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (options.decodeFails) throw new Error('bad file')
      return bitmap as unknown as ImageBitmap
    }),
  )
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  calls.canvases = []
  encodeOverride = null
  return { bitmap }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── computeScaledSize (logique pure) ────────────────────────────────────────

describe('computeScaledSize', () => {
  it('ne change pas une image déjà sous la limite', () => {
    expect(computeScaledSize(1200, 900)).toEqual({ width: 1200, height: 900 })
    expect(computeScaledSize(MAX_DIMENSION, 900)).toEqual({
      width: MAX_DIMENSION,
      height: 900,
    })
  })

  it('ne grandit jamais (pas d’upscaling)', () => {
    expect(computeScaledSize(800, 600).width).toBe(800)
  })

  it('ramène le plus long côté à MAX_DIMENSION, ratios conservés', () => {
    expect(computeScaledSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(computeScaledSize(6000, 1500)).toEqual({ width: 1600, height: 400 })
  })

  it('ne réduit jamais à 0 px (panoramas extrêmes)', () => {
    const size = computeScaledSize(20000, 100)
    expect(size.width).toBe(MAX_DIMENSION)
    expect(size.height).toBeGreaterThanOrEqual(1)
  })
})

// ── compressPhoto ───────────────────────────────────────────────────────────

describe('compressPhoto', () => {
  it('refuse le fichier brut > 10 Mo sans même le décoder (D16)', async () => {
    const spy = vi.fn()
    vi.stubGlobal('createImageBitmap', spy)
    await expect(
      compressPhoto(blobOfSize(MAX_RAW_BYTES + 1)),
    ).rejects.toMatchObject({ code: 'too_large', name: 'ImageError' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('reduit, encode en JPEG à la taille calculée et libère le bitmap', async () => {
    const { bitmap } = stubImage({ width: 4000, height: 3000 })
    const result = await compressPhoto(blobOfSize(2 * 1024 * 1024))

    expect(result).toMatchObject({ width: 1600, height: 1200 })
    expect(result.blob.type).toBe('image/jpeg')

    const [canvas] = calls.canvases
    expect(canvas).toMatchObject({ width: 1600, height: 1200 })
    expect(canvas.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 1200)
    expect(canvas.convertToBlob).toHaveBeenCalledWith({
      type: 'image/jpeg',
      quality: JPEG_QUALITY,
    })
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('conserve les dimensions d’une petite photo (pas d’upscale)', async () => {
    stubImage({ width: 900, height: 700 })
    const result = await compressPhoto(blobOfSize(200 * 1024))
    expect(result).toMatchObject({ width: 900, height: 700 })
  })

  it('translate un échec de décodage en ImageError « decode »', async () => {
    stubImage({ width: 0, height: 0, decodeFails: true })
    await expect(compressPhoto(blobOfSize(1024))).rejects.toMatchObject({
      name: 'ImageError',
      code: 'decode',
    })
  })

  it('refuse une sortie qui dépasserait malgré tout 10 Mo', async () => {
    stubImage({ width: 1600, height: 1200 })
    encodeOverride = () => blobOfSize(MAX_RAW_BYTES + 1)
    await expect(
      compressPhoto(blobOfSize(9 * 1024 * 1024)),
    ).rejects.toMatchObject({ code: 'too_large' })
  })
})
