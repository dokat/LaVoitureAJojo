# Plan d'exécution — LaVoitureAJojo

Huit milestones découlant de [`decisions.md`](decisions.md) ; un milestone
s'exécute dans une session dédiée (protocole dans `AGENTS.md` à la racine).
Chaque section porte ses tâches, ses **prérequis** et ses **notes** (écarts,
pièges, consignes pour la session suivante).

| #   | Milestone           | Statut     |
| --- | ------------------- | ---------- |
| 1   | Scaffold            | ✅ terminé |
| 2   | Schéma & RLS        | ✅ terminé |
| 3   | Authentification    | ⬜ à venir |
| 4   | Cœur métier         | ⬜ à venir |
| 5   | UI v1               | ⬜ à venir |
| 6   | Admin & soft-delete | ⬜ à venir |
| 7   | Offline / PWA       | ⬜ à venir |
| 8   | CI & déploiement    | ✅ terminé |

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

## Milestone 2 — Schéma & RLS ✅

- [x] Migrations SQL versionnées (`supabase/migrations/`) : `profiles`,
      `vehicles` (avec le véhicule de dev), `kilometers`
- [x] Trigger SQL appliquant la règle anti-recul D6 à l'insertion
- [x] Policies RLS : SELECT tout authentifié ; INSERT tout authentifié sur
      véhicule actif ; soft-delete par update des champs `deleted_*` (auteur
      ou admin) ; restauration admin
- [x] Helper SQL `is_admin()` basé sur `profiles.role`
- [x] Bucket storage privé `photos` + policies (lecture authentifiés,
      écriture auteur) ; chemin objet `{user_id}/{reading_id}.jpg`
- [x] Seed : véhicule réel + véhicule dev, compte admin initial marqué à la
      main
- [x] Test du déclenchement D6 via `pgTAP` ou SQL manuel documenté

Prérequis : projet Supabase gratuit créé ; `SUPABASE_URL` + clé anon dans
`.env.local` ; un compte créé dans Supabase Auth pour le futur admin.

Notes :

- Le compte admin `jonathan.perrinet@gmail.com` a été **créé par SQL** pendant
  cette session (auth.users, email confirmé) avec un **mot de passe
  temporaire communiqué en chat, jamais commité** → le changer (reset email
  dès que le flux milestone 3 existe, ou dashboard > Users).
- Écart pgTAP : l'extension n'est pas activée (CLI absent) ; les tests sont
  des scripts SQL documentés dans `supabase/tests/`, auto-rollbackés, à
  exécuter d'un trait dans le SQL Editor. Résultat 2026-11-26 : D6 12/12,
  RLS 20/20 + anon 0 fuite.
- Le trigger D6 (`enforce_odometer_no_regression`) ne recontrôle **que**
  l'insertion et la restauration (deleted_at → NULL) ; soft-delete = toujours
  permitted. `TG_OP` est en MAJUSCULES — premier jet comparait à 'update',
  corrigé avant commit. Le trigger `kilometers_immutable` garde km/reading_at/
  vehicle_id/user_id (D7 : pas d'édition, suppression + ressaisie).
- Sémantique RLS piégeuse : un UPDATE dont la ligne ne passe pas USING ne
  lève **rien** (0 ligne, silencieux) ; seule une violation WITH CHECK lève 42501. Les tests jugent l'**état**, pas l'exception (voir en-tête de
  `supabase/tests/rls_smoke_test.sql`).
- `is_admin()` est SECURITY INVOKER (lit profiles via sa policy SELECT) ;
  `handle_new_user()` (definer) a vu son EXECUTE retiré à public/anon/
  authenticated et rendu à service_role + supabase_auth_admin +
  supabase_admin, sinon les inscriptions GoTrue cassent.
- Versions des migrations : appliquées via MCP `apply_migration`, l'historique
  distant porte ses propres horodatages (≠ noms de fichiers du repo). Au
  milestone 8, réaligner avec `supabase db pull`/CLI. Le seed de promotion
  admin est un UPDATE par email : 0 ligne si le compte n'existe pas encore →
  le rejouer à la main après création du compte.
- Reste à faire **dans le dashboard** (hors SQL, prérequis milestone 3) :
  activer la protection « leaked password » (advisors WARN), et la whitelist
  d'emails (D15) dans Authentication → Sign In / Sign Up.
- Bucket `photos` : privé, JPEG seul, limite 10 Mo côté bucket (cohérent
  D16) ; pas de policies UPDATE/DELETE (les octets sont figés, D7).

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

## Milestone 8 — CI & déploiement ✅

- [x] Dépôt GitHub public ; push sur `main`
- [x] Workflow GitHub Actions : typecheck + lint + build → Pages (base path
      `/<repo>/`)
- [x] Secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- [ ] Vérifier signed URLs et callback OAuth depuis le domaine Pages —
      reporté au milestone 3, sans objet sur un placeholder sans auth (D20)

Prérequis : milestone 7 ; compte GitHub ; redirection OAuth Supabase pointant
aussi vers l'URL Pages.

Notes :

- Exécuté **hors ordre** (milestones 3-7 non faits), décision produit D20. Ce
  qui est réellement acquis : pipeline CI + site live ; ce qui est reporté :
  toute vérification comportementale exigeant login ou photos.
- Site : `https://dokat.github.io/LaVoitureAJojo/` (200 ✅). Dépôt
  `dokat/LaVoitureAJojo` public, Pages en `build_type: workflow`.
- Workflow `.github/workflows/deploy.yml` : push sur `main` (ou dispatch
  manuel) → `npm ci`, `typecheck` (script ajouté), `lint`, `build`,
  `configure-pages`, `upload-pages-artifact`, `deploy-pages`. Les 4 clés d'API
  publiques utilisées (checkout/setup-node/configure-pages v4,
  upload-pages-artifact v3, deploy-pages v4) sont les versions mineures
  stables à la date de session.
- Base path : `vite.config.ts` lit `BASE_PATH` (défaut `/` en local) ; le
  workflow injecte `/<nom-du-dépôt>/`. Un futur changement de nom de dépôt
  GitHub casse les URLs — à savoir, pas besoin de config supplémentaire.
- `cp dist/index.html dist/404.html` : fallback SPA déjà en place, requis dès
  que react-router exposera des URLs profondes (milestone 3+). Vérifié : une
  URL inconnue renvoie le HTML de l'app avec les chemins `/LaVoitureAJojo/…`
  (le statut HTTP 404 est inhérent à Pages, le navigateur rend la page).
- Secrets GitHub : URL du projet + clé **publishable** (D21). `.env.local`
  local utilisait `VITE_SUPABASE_PUBLISHABLE_KEY` ; renommé en
  `VITE_SUPABASE_ANON_KEY` pour coller à `lib/supabase.ts`. Vérifié : la clé
  publishable est acceptée par Auth/Storage/PostgREST sur ce projet.
  L'embarquement des env dans le bundle n'est pas encore observable (aucun
  module n'importe `lib/supabase.ts` — tree-shaking) ; à confirmer au
  milestone 3 quand le client Supabase sera vivant en prod.
- Prévu ici mais **non fait** : réalignement de l'historique de migrations
  local avec le distant (`supabase db pull`, cf. notes milestone 2) — CLI
  Supabase absent de ce poste. Reste dû ; à traiter avant toute nouvelle
  migration (cf. Dette).
- Session suivante (milestone 3) : déclarer l'URL Pages dans les Allowed
  Redirect URLs de Supabase Auth ; faire la vérification reportée de la
  tâche 4 ; changer le mot de passe temporaire de l'admin (notes M2).

## Dette / points de vigilance

- Cohérence D6 entre trigger SQL et hook client : le trigger est la source de
  vérité, le client ne fait que l'UX.
- IndexedDB + photos : gérer le quota navigateur (nettoyer les items
  synchronisés uniquement).
- La whitelist d'emails Supabase s'applique aussi à OAuth Google — à tester
  explicitement au milestone 3.
- Ne jamais embarquer la clé `service_role` dans le bundle (repo public).
- Réalignement migrations locales ↔ distantes (`supabase db pull`) reporté
  par la session milestone 8 (CLI absent) : à faire avant la prochaine
  migration SQL, sinon le CLI recreusera un conflit d'historique.
