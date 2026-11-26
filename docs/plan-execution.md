# Plan d'exécution — LaVoitureAJojo

Huit milestones découlant de [`decisions.md`](decisions.md). Statut au
2026-11-26.

| #   | Milestone           | Statut     |
| --- | ------------------- | ---------- |
| 1   | Scaffold            | ✅ terminé |
| 2   | Schéma & RLS        | ⬜ à venir |
| 3   | Authentification    | ⬜ à venir |
| 4   | Cœur métier         | ⬜ à venir |
| 5   | UI v1               | ⬜ à venir |
| 6   | Admin & soft-delete | ⬜ à venir |
| 7   | Offline / PWA       | ⬜ à venir |
| 8   | CI & déploiement    | ⬜ à venir |

## Milestone 1 — Scaffold ✅

- [x] `npm create vite` (template react-ts) dans `LaVoitureAJojo/`
- [x] React 19, TypeScript ~7, Vite 8
- [x] Tailwind CSS 4 via `@tailwindcss/vite`, alias `@/` (vite.config,
      tsconfigs)
- [x] shadcn/ui initialisé (base radix, preset nova) + `button`, `card`,
      `input`, `label`
- [x] `@supabase/supabase-js`, `lib/supabase.ts` (lecture des env vars,
      typed via `vite-env.d.ts`), `.env.example`
- [x] Structure en couches : `components/`, `features/`, `hooks/`,
      `repositories/`, `lib/` — avec README de règles (D10)
- [x] Prettier + script `format` ; lint : **oxlint** (le template Vite a
      remplacé ESLint par oxlint — décision implicite du scaffold, assumée)
- [x] `npm run build` passe ; App.tsx réduit à un placeholder
- [x] git init + commit initial

Écarts mineurs vs plan annoncé : ESLint → oxlint (imposé par le template) ;
le projet est dans un sous-répertoire de `applis_web` (demande produit).

## Milestone 2 — Schéma & RLS

- [ ] Migrations SQL versionnées (`supabase/migrations/`) : `profiles`,
      `vehicles` (avec le véhicule de dev), `kilometers`
- [ ] Trigger SQL appliquant la règle anti-recul D6 à l'insertion
- [ ] Policies RLS : SELECT tout authentifié ; INSERT tout authentifié sur
      véhicule actif ; soft-delete par update des champs `deleted_*` (auteur
      ou admin) ; restauration admin
- [ ] Helper SQL `is_admin()` basé sur `profiles.role`
- [ ] Bucket storage privé `photos` + policies (lecture authentifiés,
      écriture auteur) ; chemin objet `user_id/read_id.jpg`
- [ ] Seed : véhicule réel + véhicule dev, compte admin initial marqué à la
      main

Prérequis produit : projet Supabase créé, compte admin existant.

## Milestone 3 — Authentification

- [ ] `authRepository` (signIn password, OAuth Google, reset, session,
      onAuthStateChange)
- [ ] Hook `useAuth` + provider ; écran login ; route protégée
- [ ] Vérification du rôle admin chargé depuis `profiles` au login
- [ ] Note doc : activer la whitelist d'emails dans le dashboard Supabase
      (D15)

## Milestone 4 — Cœur métier

- [ ] `vehiclesRepository`, `kilometersRepository`, `profilesRepository`
- [ ] Compression client des photos (canvas ~1600 px / JPEG 80 %, EXIF
      stripped, garde-fou 10 Mo) dans `lib/images.ts` + test
- [ ] Hook `useOdometerValidation` (règle D6 côté client, messages clairs)
- [ ] Hook `useReadings` (liste, ajout avec upload photo, soft-delete)
- [ ] Types du domaine dans `src/types/`

## Milestone 5 — UI v1

- [ ] Dashboard : dernier km, dernier relevé, graphique Recharts (package
      chart shadcn), bouton saisie
- [ ] Historique : liste inversée, badge conflit, photo cliquable (signed
      URL)
- [ ] Formulaire de saisie mobile-first : km (clavier numérique), date/heure
      (défaut maintenant, éditable), % essence, notes, caméra/photos
- [ ] Navigation par routes (`react-router`) + layout mobile

## Milestone 6 — Admin & soft-delete

- [ ] Toggle « voir les suppressions » + bouton restaurer (admin)
- [ ] Sélecteur de véhicule actif (admin) + édition infos véhicule
- [ ] Filtre historique « par utilisateur » (admin)

## Milestone 7 — Offline / PWA

- [ ] `vite-plugin-pwa` : manifeste, icônes, installabilité, offline shell
- [ ] File IndexedDB (DB locale `pending` : km, date locale, blob photo,
      notes, essence)
- [ ] Synchroniseur au retour en ligne ; D6 réévaluée à la synchro ; item en
      échec → badge « en attente — conflit », éditable/abandonnable (D13)
- [ ] Écran/indicateur « items en attente »

## Milestone 8 — CI & déploiement

- [ ] Workflow GitHub Actions : typecheck + lint + build → Pages (base path
      `/<repo>/`)
- [ ] Secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- [ ] Vérif signed URLs avec domaine Pages ; docs de mise en route

## Dette / points de vigilance

- Cohérence D6 entre trigger SQL et hook client : le trigger est la source
  de vérité, le client ne fait que l'UX.
- IndexedDB + photos : gérer le quota navigateur (nettoyer les items sync'
  uniquement).
- La whitelist d'emails Supabase s'applique aussi à OAuth Google — à tester
  explicitement au milestone 3.
