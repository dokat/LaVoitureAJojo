// Règle anti-recul D6 côté client : UX seule — le trigger SQL reste la
// vérité (D18, section Dette du plan). Le hook donne un verdict AVANT envoi,
// avec un message qui explique comment s'en sortir (rétro-saisie ou
// correction par suppression + ressaisie, D7).
import { useCallback } from 'react'

/** Point d'appui d'une comparaison D6 : dernier relevé vivant ou candidat. */
export type OdometerPoint = { km: number; readingAt: Date }

export type OdometerVerdict =
  | { ok: true }
  | {
      ok: false
      reason: 'invalid_km' | 'regression'
      message: string
    }

const kmFormat = new Intl.NumberFormat('fr-FR')
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
})

/** Version pure de la règle, testable sans React. */
export function validateOdometer(
  candidate: OdometerPoint,
  last: OdometerPoint | null,
): OdometerVerdict {
  if (!Number.isInteger(candidate.km) || candidate.km < 0) {
    return {
      ok: false,
      reason: 'invalid_km',
      message: 'Le kilométrage doit être un entier positif ou nul.',
    }
  }
  if (Number.isNaN(candidate.readingAt.getTime())) {
    return {
      ok: false,
      reason: 'invalid_km',
      message: 'La date du relevé est invalide.',
    }
  }
  if (!last) return { ok: true } // premier relevé : rien à comparer
  if (candidate.km >= last.km) return { ok: true } // égalité acceptée (D6)
  if (candidate.readingAt < last.readingAt) return { ok: true } // rétro-saisie
  return {
    ok: false,
    reason: 'regression',
    message:
      `Relevé refusé : ${kmFormat.format(candidate.km)} km est inférieur au ` +
      `dernier relevé (${kmFormat.format(last.km)} km du ` +
      `${dateFormat.format(last.readingAt)}). Une valeur inférieure n\u2019est ` +
      'acceptée qu\u2019avec une date strictement antérieure. Si le dernier ' +
      'relevé est erroné, corrigez-le : suppression puis ressaisie.',
  }
}

/**
 * Retourne la fonction de validation branchée sur le dernier relevé (celui de
 * useReadings). Quand `last` change, validate est régénérée — pas de stale
 * closure dans le formulaire.
 */
export function useOdometerValidation(last: OdometerPoint | null) {
  return useCallback(
    (candidate: OdometerPoint) => validateOdometer(candidate, last),
    [last],
  )
}
