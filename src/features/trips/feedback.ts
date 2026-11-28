// Bandeau de retour des actions sortie (page TripFormPage) : « ok » = écriture
// passée en base ; « queued » = intention mise en file hors-ligne (D39) ;
// « warn » = attention (photo en échec, esprit D25). Les erreurs bloquantes
// restent dans le formulaire, pas ici.
export type TripFeedback = {
  tone: 'ok' | 'queued' | 'warn'
  text: string
} | null
