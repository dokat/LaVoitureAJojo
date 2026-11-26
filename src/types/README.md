# types/

Types **générés** : `supabase.ts`, produit par `supabase gen types` depuis la
base réelle, paramètre `createClient<Database>` (D24). Noms de colonnes et
formes SQL — à régénérer après chaque migration, ne pas éditer à la main.

Les types du **domaine** (`Vehicle`, `Reading`, `Profile`, `ProfileRole`) ne
vivent plus ici : leur source de vérité est `src/schemas/` (zod, D26), et les
hooks, composants et repositories les importent en `import type` depuis les
modules de schéma concernés. Il n'y a donc pas de doublon : une forme générée
pour la base, un schéma pour le domaine, rien entre les deux qui puisse
dériver.
