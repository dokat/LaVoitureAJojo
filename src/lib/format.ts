// Formatage d'affichage partagé (fr-FR) : les pages n'inventent pas leurs
// formats, et `toInputDateTime*` encadre la sémantique D14 (date locale de la
// manipulation, pré-remplie « maintenant », éditable).
const km = new Intl.NumberFormat('fr-FR')
const longDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const shortDateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatKm(value: number): string {
  return km.format(value)
}

export function formatLongDate(date: Date): string {
  return longDate.format(date)
}

export function formatDateTime(date: Date): string {
  return shortDateTime.format(date)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Valeur d'un <input type="datetime-local"> en heure locale (D14). */
export function toInputDateTimeLocal(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/**
 * Lecture d'un <input type="datetime-local"> : la chaîne sans fuseau est
 * interprétée en heure locale par Date — c'est exactement la sémantique D14.
 */
export function fromInputDateTimeLocal(value: string): Date {
  return new Date(value)
}
