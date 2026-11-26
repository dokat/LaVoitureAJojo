# LaVoitureAJojo 🚗

Application web de suivi kilométrique pour une voiture partagée. Chaque
utilisateur authentifié enregistre le kilométrage relevé à un instant T, avec
optionnellement une photo, le niveau d'essence (%) et des notes. Base de
données, authentification et stockage de fichiers assurés par **Supabase**.

## Stack

- [Vite](https://vite.dev) + React 19 + TypeScript
- Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com) (Recharts pour les graphes)
- [@supabase/supabase-js](https://supabase.com/docs/reference/javascript)
- PWA installable, saisie possible hors-ligne (milestone 7)

## Démarrage

```bash
npm install
cp .env.example .env.local   # renseigner URL + clé anon du projet Supabase
npm run dev
```

## Scripts

| Commande          | Rôle                            |
| ----------------- | ------------------------------- |
| `npm run dev`     | serveur de développement        |
| `npm run build`   | typecheck + build de production |
| `npm run lint`    | oxlint                          |
| `npm run format`  | Prettier (écriture)             |
| `npm run preview` | prévisualisation du build       |

## Architecture

```
src/
├── components/ui/   # briques shadcn (générées, ne pas éditer à la main)
├── features/        # découpage par fonctionnalité métier
├── hooks/           # logique métier réutilisable
├── repositories/    # accès base de données (seule couche qui parle à Supabase)
└── lib/             # clients (supabase), utilitaires (cn)
```

Règles de découpe : les composants n'appellent jamais supabase-js directement,
les hooks orchestrent les repositories, le partage entre features passe par
les hooks. Voir les README de chaque dossier.

## Documentation

- [`docs/decisions.md`](docs/decisions.md) — arbre des décisions de design
  validées (modèle métier, règles, RLS, offline, hébergement…)
- [`docs/plan-execution.md`](docs/plan-execution.md) — les 8 milestones de
  construction et leur état d'avancement

## Environnement

Un **seul projet Supabase** : la base contient la vraie voiture et un véhicule
de test (`vehicles.is_active`). L'admin bascule de l'un à l'autre depuis
l'app. Voir docs/decisions.md (D3, D17).
