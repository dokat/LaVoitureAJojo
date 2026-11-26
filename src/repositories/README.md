# repositories/

Accès base de données : un module par agrégat (`kilometersRepository`,
`vehiclesRepository`, `profilesRepository`, storage photos).

Règles :

- seule couche autorisée à importer `lib/supabase.ts` pour les données ;
- retourne des types du domaine, jamais des `PostgrestResponse` bruts ;
- les erreurs Supabase sont converties en erreurs typées ;
- les hooks et composants n'appellent **jamais** supabase-js directement.
