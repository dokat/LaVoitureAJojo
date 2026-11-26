// Icônes PWA (milestone 7) — générées par script, pas de binaire graphique.
// PNG RGBA écrit à la main (IHDR/IDAT/IEND + zlib), glyphes dessinés en
// géométrie de pixel : fond arrondi quasi-noir (palette du thème shadcn nova)
// + cadran de compteur blanc (D6 est au centre de l'app).
// Relance : node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'icons',
)
mkdirSync(out, { recursive: true })

// — PNG minimal (8-bit RGBA, filter 0, sans interlace) —
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.writeUInt8(8, 8) // profondeur
  ihdr.writeUInt8(6, 9) // RGBA
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filtre None
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// — Dessin du cadran —
const BG = [24, 24, 27, 255] // zinc-900
const FG = [250, 250, 249, 255]
function draw(size, { rounded = true, safe = 0.34 }) {
  const px = Buffer.alloc(size * size * 4)
  const c = size / 2 - 0.5
  const R = size * safe // rayon de l'anneau
  const ring = size * 0.055 // épaisseur anneau
  const needle = size * 0.05 // demi-épaisseur aiguille
  const hub = size * 0.075
  const corner = size * 0.22
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // fond : carré (maskable) ou coins arrondis
      let inside
      if (!rounded) inside = true
      else {
        const dx = Math.max(Math.abs(x - c) - (c - corner), 0)
        const dy = Math.max(Math.abs(y - c) - (c - corner), 0)
        inside = dx * dx + dy * dy <= corner * corner
      }
      if (!inside) continue // transparent
      px[i] = BG[0]
      px[i + 1] = BG[1]
      px[i + 2] = BG[2]
      px[i + 3] = BG[3]
      const dx = x - c
      const dy = y - c
      const dist = Math.hypot(dx, dy)
      // angle écran (y vers le bas) : le cadran balaie 135° → 405°
      let ang = (Math.atan2(dy, dx) * 180) / Math.PI
      if (ang < 135) ang += 360
      const inSweep = ang >= 135 && ang <= 405
      // anneau + graduations aux extrémités et en haut
      if (inSweep && Math.abs(dist - R) <= ring / 2) paint(px, i, FG)
      for (const tick of [135, 225, 315, 405]) {
        if (
          ang >= tick - 2 &&
          ang <= tick + 2 &&
          dist >= R + ring &&
          dist <= R + ring * 2.4
        )
          paint(px, i, FG)
      }
      // aiguille vers 315° (haut-droite), tronconique
      const th = (315 * Math.PI) / 180
      const ux = Math.cos(th),
        uy = Math.sin(th)
      const t = Math.max(0, Math.min(dx * ux + dy * uy, R * 0.82))
      const pxp = dx - ux * t,
        pyp = dy - uy * t
      if (
        t > hub * 0.5 &&
        Math.hypot(pxp, pyp) <= needle * (1 - (t / (R * 0.82)) * 0.75)
      )
        paint(px, i, FG)
      // moyeu
      if (dist <= hub) paint(px, i, FG)
    }
  }
  return px
}
function paint(px, i, [r, g, b, a]) {
  px[i] = r
  px[i + 1] = g
  px[i + 2] = b
  px[i + 3] = a
}

const files = {
  'pwa-192x192.png': [192, { rounded: true, safe: 0.34 }],
  'pwa-512x512.png': [512, { rounded: true, safe: 0.34 }],
  'maskable-icon-512x512.png': [512, { rounded: false, safe: 0.27 }],
  'apple-touch-icon.png': [180, { rounded: false, safe: 0.34 }],
}
for (const [name, [size, opts]] of Object.entries(files)) {
  writeFileSync(join(out, name), encodePng(size, draw(size, opts)))
  console.log(name, 'ok')
}
