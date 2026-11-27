// Schémas zod (D26) : la conversion ligne PostgREST → forme domaine est la
// source de vérité des types du domaine. Ce test fige le mapping snake →
// camel, ISO → Date, les bornes des check SQL et la règle D8 (« jamais de
// promotion »). Pur et local (D23).
import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import type { Reading } from '@/schemas/kilometers'
import type { Vehicle } from '@/schemas/vehicles'
import type { Profile, ProfileRole } from '@/schemas/profiles'
import type { Trip } from '@/schemas/trips'
import { readingRowSchema } from '@/schemas/kilometers'
import { vehicleRowSchema } from '@/schemas/vehicles'
import { profileRowSchema, dbProfileRoleSchema } from '@/schemas/profiles'
import { tripRowSchema } from '@/schemas/trips'

// UUIDs valides (version 4, variante 10xx) : z.uuid() vérifie les bits.
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const UUID_C = '33333333-3333-4333-8333-333333333333'

// Formats réellement renvoyés par PostgREST : timestamptz en ISO avec offset.
function kilometerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_A,
    vehicle_id: UUID_B,
    user_id: UUID_C,
    km: 12450,
    fuel_percent: 75,
    photo_path: `${UUID_C}/${UUID_A}.jpg`,
    notes: 'plein fait',
    reading_at: '2026-11-26T08:30:00.000000+00:00',
    deleted_at: null,
    deleted_by: null,
    restored_at: null,
    created_at: '2026-11-26T08:30:05Z',
    ...overrides,
  }
}

describe('readingRowSchema (kilometers → Reading)', () => {
  it('convertit la ligne snake_case en relevé domaine', () => {
    const reading: Reading = readingRowSchema.parse(kilometerRow())
    expect(reading).toEqual({
      id: UUID_A,
      vehicleId: UUID_B,
      userId: UUID_C,
      km: 12450,
      fuelPercent: 75,
      photoPath: `${UUID_C}/${UUID_A}.jpg`,
      notes: 'plein fait',
      readingAt: new Date('2026-11-26T08:30:00Z'),
      deletedAt: null,
      deletedBy: null,
      restoredAt: null,
      createdAt: new Date('2026-11-26T08:30:05Z'),
    })
    expect(reading.readingAt).toBeInstanceOf(Date)
  })

  it('accepte les colonnes en plus (une migration avant régénération)', () => {
    const row = kilometerRow({ future_column: 'ignoree' })
    expect(readingRowSchema.parse(row).km).toBe(12450)
  })

  it.each([
    ['km négatif (check SQL km >= 0)', { km: -1 }],
    ['fuel_percent hors 0–100', { fuel_percent: 120 }],
    ['uuid invalide', { vehicle_id: 'pas-un-uuid' }],
    ['reading_at non ISO (D14)', { reading_at: '26/11/2026' }],
    ['colonne obligatoire absente', { created_at: undefined }],
  ])('rejette : %s', (_name, overrides) => {
    expect(() => readingRowSchema.parse(kilometerRow(overrides))).toThrow(
      ZodError,
    )
  })
})

describe('vehicleRowSchema (vehicles → Vehicle)', () => {
  it('convertit sans created_at (omis du select des repositories)', () => {
    const vehicle: Vehicle = vehicleRowSchema.parse({
      id: UUID_B,
      brand: 'Renault',
      model: 'Clio',
      plate: 'AB-123-CD',
      is_active: true,
    })
    expect(vehicle).toEqual({
      id: UUID_B,
      brand: 'Renault',
      model: 'Clio',
      plate: 'AB-123-CD',
      isActive: true,
    })
  })
})

describe('tripRowSchema (trips → Trip, D30)', () => {
  const UUID_D = '44444444-4444-4444-8444-444444444444'
  const tripRow = (overrides: Record<string, unknown> = {}) => ({
    id: UUID_A,
    vehicle_id: UUID_B,
    start_reading_id: UUID_C,
    end_reading_id: null,
    cancelled_at: null,
    created_at: '2026-11-27T09:00:00.000000+00:00',
    ...overrides,
  })

  it('convertit la ligne de liaison en sortie domaine (snake → camel, ISO → Date)', () => {
    const trip: Trip = tripRowSchema.parse(tripRow({ end_reading_id: UUID_D }))
    expect(trip).toEqual({
      id: UUID_A,
      vehicleId: UUID_B,
      startReadingId: UUID_C,
      endReadingId: UUID_D,
      cancelledAt: null,
      createdAt: new Date('2026-11-27T09:00:00Z'),
    })
    expect(trip.createdAt).toBeInstanceOf(Date)
  })

  it('end_reading_id NULL = sortie en cours (D30)', () => {
    expect(tripRowSchema.parse(tripRow()).endReadingId).toBeNull()
  })

  it('cancelled_at porte la trace d’annulation en Date (D36)', () => {
    const trip = tripRowSchema.parse(
      tripRow({ cancelled_at: '2026-11-27T10:00:00Z' }),
    )
    expect(trip.cancelledAt).toEqual(new Date('2026-11-27T10:00:00Z'))
  })

  it.each([
    ['départ manquant (NOT NULL D30)', { start_reading_id: null }],
    ['uuid invalide', { vehicle_id: 'pas-un-uuid' }],
    ['created_at non ISO', { created_at: '27/11/2026' }],
  ])('rejette : %s', (_name, overrides) => {
    expect(() => tripRowSchema.parse(tripRow(overrides))).toThrow(ZodError)
  })
})

describe('profileRowSchema + rôle (D8)', () => {
  it('convertit un profil admin', () => {
    const profile: Profile = profileRowSchema.parse({
      id: UUID_C,
      role: 'admin',
      email: 'jo@example.com',
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(profile.role).toBe('admin')
    expect(profile.email).toBe('jo@example.com')
    expect(profile.createdAt).toBeInstanceOf(Date)
  })

  it('accepte email null (ligne antérieure à la migration D27)', () => {
    const profile: Profile = profileRowSchema.parse({
      id: UUID_C,
      role: 'membre',
      email: null,
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(profile.email).toBeNull()
  })

  it('ne promeut jamais par défaut : toute valeur hors enum vaut « membre »', () => {
    const role: ProfileRole = dbProfileRoleSchema.parse('superuser')
    expect(role).toBe('membre')
  })
})
