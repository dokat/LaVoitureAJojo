// Forme d'une extrémité dans un formulaire : valeurs brutes (chaînes des
// inputs, fichier photo) et dérive vers le `TripEndpointInput` du hook après
// contrôle de FORME (entiers, bornes, date valide — D5/D14). Les règles
// métier (D6, D34) sont demandées au hook, jamais ici.
import { fromInputDateTimeLocal, toInputDateTimeLocal } from '@/lib/format'
import type { TripEndpointInput } from '@/hooks/useTrips'

export type EndpointFormValue = {
  km: string
  /** Valeur du <input datetime-local> — sémantique locale (D14). */
  readingAt: string
  fuel: string
  notes: string
  photo: File | null
}

export function freshEndpointForm(): EndpointFormValue {
  return {
    km: '',
    readingAt: toInputDateTimeLocal(new Date()),
    fuel: '',
    notes: '',
    photo: null,
  }
}

export type ParsedEndpoint =
  { ok: true; input: TripEndpointInput } | { ok: false; message: string }

export function parseEndpointForm(value: EndpointFormValue): ParsedEndpoint {
  const km = Number(value.km)
  if (!Number.isInteger(km) || km < 0) {
    return {
      ok: false,
      message: 'Le kilométrage doit être un entier positif ou nul.',
    }
  }
  const readingAt = fromInputDateTimeLocal(value.readingAt)
  if (Number.isNaN(readingAt.getTime())) {
    return { ok: false, message: 'La date du relevé est invalide.' }
  }
  const fuel = value.fuel.trim() === '' ? null : Number(value.fuel)
  if (fuel !== null && (!Number.isInteger(fuel) || fuel < 0 || fuel > 100)) {
    return {
      ok: false,
      message: 'Le niveau d’essence doit être un entier entre 0 et 100.',
    }
  }
  return {
    ok: true,
    input: {
      km,
      readingAt,
      fuelPercent: fuel,
      notes: value.notes.trim() === '' ? null : value.notes.trim(),
      photo: value.photo,
    },
  }
}
