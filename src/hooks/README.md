# hooks/

Logique métier réutilisable : `useAuth`, `useReadings` (chronologie + filtres
admin), `useOdometerValidation` (règle anti-recul), `useVehicles` (flotte,
bascule et infos — admin), `useProfiles` (libellés utilisateurs),
`usePhotoUrl`, `usePendingQueue` (file hors-ligne)…

Règles :

- orchestrent les repositories, exposent des états/actions au domaine ;
- aucun JSX, aucun SELECT supabase directement ;
- un hook = une responsabilité.
