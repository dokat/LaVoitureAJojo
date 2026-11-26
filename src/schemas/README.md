# schemas/

Schémas **zod** des lignes PostgREST (D26) : source de vérité des types du
domaine. Un fichier par agrégat, miroir des repositories.

Règles :

- chaque schéma décrit la **ligne SQL** (snake_case, ISO strings) et se
  transforme lui-même en **forme domaine** (camelCase, `Date`) : le mapping
  snake ↔ camel vit ici, pas dans les repositories ;
- les types du domaine sont les `z.output` des schémas : c'est ici qu'on les
  importe (`import type { Reading } from '@/schemas/kilometers'`), hooks et
  composants compris — il n'y a pas de fichier de types intermédiaire (D26) ;
- les contraintes reflètent les `check` SQL (km ≥ 0, fuel 0–100, rôle) : le
  parse échoue si la base contredit le domaine — l'erreur devient une
  `DataError` via `repositories/errors.ts` ;
- anti-dérive (D24) : les mappers des repositories prennent
  `z.input<…Schema>` en paramètre ; si le type généré (régénéré après chaque
  migration) ne fournit plus ce que le schéma exige, le typecheck casse.
