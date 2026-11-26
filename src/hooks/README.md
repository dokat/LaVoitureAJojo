# hooks/

Logique métier réutilisable : `useAuth`, `useReadings`,
`useOdometerValidation` (règle anti-recul), `usePendingQueue` (file hors-ligne),
`useVehicle`…

Règles :

- orchestrent les repositories, exposent des états/actions au domaine ;
- aucun JSX, aucun SELECT supabase directement ;
- un hook = une responsabilité.
