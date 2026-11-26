# AGENTS.md — LaVoitureAJojo

Suivi kilométrique d'une voiture partagée (React 19 / Vite / Supabase). Le
projet se construit en 8 milestones, **un milestone = une session**. Une
session n'exécute qu'un seul milestone, le sien.

## Déroulé de session

1. Lire `docs/decisions.md` (contrat de design, D1→D17) puis
   `docs/plan-execution.md` : tableaux de statut, tâches cochables, notes des
   sessions précédentes.
2. Le milestone à exécuter = la première ligne du tableau de statut qui n'est
   pas ✅. Les tâches `[ ]` de sa section sont la checklist exhaustive de la
   session.
3. Prérequis hors-repo du milestone (ligne « Prérequis » de sa section) :
   s'ils manquent (ex. `.env.local` Supabase absent), demander à
   l'utilisateur avant d'écrire du code qui en dépend.
4. Terminer : `npm run build` et `npm run lint` au vert, chaque tâche `[x]`
   vérifiée par son critère (le code fait ce que la tâche annonce, testable
   quand c'est testable).
5. Clôture de session : cocher les tâches, passer la ligne de statut à ✅,
   écrire ou mettre à jour la section « Notes » du milestone (écarts assumés,
   pièges, ce que la session suivante doit savoir), committer
   `milestone N: <résumé>`.

## Règles qui survivent aux sessions

- Le contrat est dans `docs/decisions.md` : en cas de tension entre plan et
  décision, la décision gagne, et tout écart devient une nouvelle entrée
  datée dans decisions.md — jamais une réécriture silencieuse.
- Étanchéité des couches : `repositories/` est la seule couche qui parle à
  supabase-js ; les hooks portent la logique métier ; les composants restent
  petits et composables (README de chaque dossier `src/`).
- Règles métier intransigeantes (anti-recul D6, soft-delete D7, sémantique de
  date D14, offline D13) : implémentées avec un test qui les fige, côté SQL
  ET côté client quand le plan l'exige — le client est l'UX, la base est la
  vérité.
