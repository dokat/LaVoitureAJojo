# repositories/

Accès base de données : un module par agrégat (`kilometersRepository`,
`vehiclesRepository`, `profilesRepository`, `photosRepository` pour le
storage) ; `errors.ts` centralise la conversion en `DataError` typées.

Règles :

- seule couche autorisée à importer `lib/supabase.ts` pour les données ;
- le client est typé par `src/types/supabase.ts` (généré depuis la base
  réelle) — à régénérer après chaque migration ;
- la conversion ligne → domaine est faite par les schémas zod de
  `src/schemas/` (D26) : `schema.parse(row)`, jamais de mapping à la main ;
- retourne des types du domaine, jamais des `PostgrestResponse` bruts ;
- les erreurs Supabase, comme les `ZodError` d'une ligne hors schéma, sont
  converties en erreurs typées ;
- les hooks et composants n'appellent **jamais** supabase-js directement.
