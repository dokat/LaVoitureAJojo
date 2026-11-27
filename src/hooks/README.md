# hooks/

Logique métier réutilisable : `useAuth`, `useReadings` (chronologie + filtres
admin), `useTrips` (sorties : liste enrichie, ouvrir/clôturer/annuler,
validations D6/D34 avant envoi), `useOdometerValidation` (règle anti-recul),
`useVehicles` (flotte, bascule et infos — admin), `useProfiles` (libellés
utilisateurs), `usePhotoUrl`, `usePendingQueue` (file hors-ligne, intentions
relevé et sortie — `tripSync` porte l'algo de reprise partagé)…

Règles :

- orchestrent les repositories, exposent des états/actions au domaine ;
- aucun JSX, aucun SELECT supabase directement ;
- un hook = une responsabilité.
