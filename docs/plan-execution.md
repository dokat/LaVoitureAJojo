# Plan d'exécution — LaVoitureAJojo

Huit milestones découlant de [`decisions.md`](decisions.md) ; un milestone
s'exécute dans une session dédiée (protocole dans `AGENTS.md` à la racine).
Chaque section porte ses tâches, ses **prérequis** et ses **notes** (écarts,
pièges, consignes pour la session suivante).

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
      typé via `vite-env.d.ts`), `.env.example`
- [x] Structure en couches : `components/`, `features/`, `hooks/`,
      `repositories/`, `lib/` — avec README de règles (D10)
- [x] Prettier + script `format` ; lint : oxlint
- [x] `npm run build` passe ; `App.tsx` réduit à un placeholder
- [x] git init + commit

Prérequis : aucun.

Notes : écarts assumés vs plan annoncé — le template Vite livre **oxlint** à
la place d'ESLint ; TypeScript 7 a supprimé `baseUrl` (paths relatifs au
tsconfig) ; le projet vit dans le sous-répertoire `LaVoitureAJojo/` d'un
workspace `applis_web` (demande produit). Les briques shadcn actuelles
importent `radix-ui` (paquet monolithique) et `lucide-react`.

## Milestone 2 — Schéma & RLS

- [ ] Migrations SQL versionnées (`supabase/migrations/`) : `profiles`,
      `vehicles` (avec le véhicule de dev), `kilometers`
- [ ] Trigger SQL appliquant la règle anti-recul D6 à l'insertion
- [ ] Policies RLS : SELECT tout authentifié ; INSERT tout authentifié sur
      véhicule actif ; soft-delete par update des champs `deleted_*` (auteur
      ou admin) ; restauration admin
- [ ] Helper SQL `is_admin()` basé sur `profiles.role`
- [ ] Bucket storage privé `photos` + policies (lecture authentifiés,
      écriture auteur) ; chemin objet `{user_id}/{reading_id}.jpg`
- [ ] Seed : véhicule réel + véhicule dev, compte admin initial marqué à la
      main
- [ ] Test du déclenchement D6 via `pgTAP` ou SQL manuel documenté

Prérequis : projet Supabase gratuit créé ; `SUPABASE_URL` + clé anon dans
`.env.local` ; un compte créé dans Supabase Auth pour le futur admin.

Notes : —

## Milestone 3 — Authentification

- [ ] `authRepository` (signIn password, OAuth Google, reset, session,
      `onAuthStateChange`)
- [ ] Hook `useAuth` + provider ; écran login ; route protégée
      (`react-router`)
- [ ] Rôle admin chargé depuis `profiles` au login (et pas seulement depuis
      le JWT)
- [ ] Test manuel : whitelist d'emails Supabase — vérifier qu'une inscription
      Google hors liste est bien refusée (D15)

Prérequis : milestone 2 appliqué sur le projet Supabase.

Notes : —

## Milestone 4 — Cœur métier

- [ ] `vehiclesRepository`, `kilometersRepository`, `profilesRepository`
- [ ] Compression client des photos (canvas ~1600 px / JPEG 80 %, EXIF
      stripped, garde-fou 10 Mo) dans `lib/images.ts` + test unitaire
- [ ] Hook `useOdometerValidation` (règle D6 côté client, messages clairs) +
      test
- [ ] Hook `useReadings` (liste, ajout avec upload photo, soft-delete)
- [ ] Types du domaine dans `src/types/`

Prérequis : milestone 3 (un utilisateur authentifié pour tester).

Notes : —

## Milestone 5 — UI v1

- [ ] Dashboard : dernier km, dernier relevé, graphique Recharts (package
      chart shadcn), bouton saisie
- [ ] Historique : liste inversée, photo cliquable (signed URL)
- [ ] Formulaire de saisie mobile-first : km (clavier numérique), date/heure
      (défaut maintenant, éditable — D14), % essence, notes,
      caméra/photos (`capture`)
- [ ] Navigation par routes + layout mobile

Prérequis : milestone 4.

Notes : —

## Milestone 6 — Admin & soft-delete

- [ ] Toggle « voir les suppressions » + bouton restaurer (admin)
- [ ] Sélecteur de véhicule actif (admin) + édition infos véhicule
- [ ] Filtre historique « par utilisateur » (admin)
- [ ] Interdire en UI toute action réservée aux admins pour un membre
      (la RLS garde la vérité, l'UI ne fait que l'afficher)

Prérequis : milestone 5 ; un compte admin et un compte membre dans Supabase.

Notes : —

## Milestone 7 — Offline / PWA

- [ ] `vite-plugin-pwa` : manifeste, icônes, installabilité, offline shell
- [ ] File IndexedDB (`pending` : km, date locale, blob photo, notes,
      essence)
- [ ] Synchroniseur au retour en ligne ; D6 réévaluée à la synchro ; item en
      échec → badge « en attente — conflit », éditable/abandonnable (D13)
- [ ] Écran/indicateur « items en attente »
- [ ] Test : coupure réseau simulée (DevTools offline) → saisie → réconnexion
      → synchro

Prérequis : milestones 4-5 (la saisie en ligne existe).

Notes : —

## Milestone 8 — CI & déploiement

- [ ] Dépôt GitHub public ; push sur `main`
- [ ] Workflow GitHub Actions : typecheck + lint + build → Pages (base path
      `/<repo>/`)
- [ ] Secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- [ ] Vérifier signed URLs et callback OAuth depuis le domaine Pages

Prérequis : milestone 7 ; compte GitHub ; redirection OAuth Supabase pointant
aussi vers l'URL Pages.

Notes : —

## Dette / points de vigilance

- Cohérence D6 entre trigger SQL et hook client : le trigger est la source de
  vérité, le client ne fait que l'UX.
- IndexedDB + photos : gérer le quota navigateur (nettoyer les items
  synchronisés uniquement).
- La whitelist d'emails Supabase s'applique aussi à OAuth Google — à tester
  explicitement au milestone 3.
- Ne jamais embarquer la clé `service_role` dans le bundle (repo public).
