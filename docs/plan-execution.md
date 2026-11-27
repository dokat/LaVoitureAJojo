# Plan d'exécution — LaVoitureAJojo

Onze milestones découlant de [`decisions.md`](decisions.md) ; un milestone
s'exécute dans une session dédiée (protocole dans `AGENTS.md` à la racine).
Chaque section porte ses tâches, ses **prérequis** et ses **notes** (écarts,
pièges, consignes pour la session suivante).

| #   | Milestone           | Statut            |
| --- | ------------------- | ----------------- |
| 1   | Scaffold            | ✅ terminé        |
| 2   | Schéma & RLS        | ✅ terminé        |
| 3   | Authentification    | 🟡 test manuel dû |
| 4   | Cœur métier         | ✅ terminé        |
| 5   | UI v1               | ✅ terminé        |
| 6   | Admin & soft-delete | ✅ terminé        |
| 7   | Offline / PWA       | ✅ terminé        |
| 8   | CI & déploiement    | ✅ terminé        |
| 9   | Sorties — base SQL  | ✅ terminé        |
| 10  | Sorties — client    | ⬜ à venir        |
| 11  | Sorties — UI        | ⬜ à venir        |

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

## Milestone 3 — Authentification 🟡

- [x] `authRepository` (signIn password, OAuth Google, reset, session,
      `onAuthStateChange`)
- [x] Hook `useAuth` + provider ; écran login ; route protégée
      (`react-router`)
- [x] Rôle admin chargé depuis `profiles` au login (et pas seulement depuis
      le JWT)
- [ ] Test manuel : whitelist d'emails Supabase — vérifier qu'une inscription
      Google hors liste est bien refusée (D15) ← **reste dû** : exige la
      configuration du dashboard (provider Google + whitelist), voir Notes

Prérequis : milestone 2 appliqué sur le projet Supabase.

Notes :

- Architecture : le moteur est `hooks/useAuthState.ts` (sans JSX, règle des
  hooks), branché au contexte par `features/auth/AuthProvider.tsx` ; l'UI lit
  via `hooks/useAuth.ts`. Le fetch du rôle (`fetchProfileRole`) vit dans
  `authRepository` — lecture limitée à la session ; `profilesRepository`
  (CRUD profils) arrive bien au milestone 4. Écart acté en D22.
- **Piège GoTrue / création SQL de comptes** (compte de démo : 400
  `invalid_credentials` puis 500 « Database error querying schema » avec un
  hash bcrypt pourtant valide) : GoTrue scanne `auth.users` dans des types
  non-NULL — `instance_id`, `created_at`, `updated_at`, `confirmation_token`,
  `recovery_token`, `email_change*`, `*_change_token`, `reauthentication_token`
  ne doivent **jamais rester NULL** à l'insertion. Ne jamais laisser `phone`
  à `''` (contrainte UNIQUE) : le garder NULL. **La ligne du compte admin
  (créée au milestone 2) a été réalignée sur ces valeurs pendant cette
  session.**
  Pour tout futur compte SQL : soit passer par l'API admin/dashboard, soit
  reprendre la commande `insert` du script de dév de cette session (colonnes
  complètes + defaults `''`).
- Vérifié en réel (browser + compte de test créé/supprimé en SQL) : redirect
  non connecté → `/login`, erreur identifiants typée en français, login
  email+password → page protégée, rôle lu depuis `profiles` (promu
  admin en base → UI affiche admin après reload, JWT inchangé — D8 validée),
  déconnexion, garde de route, mode « mot de passe oublié ». Zéro erreur
  console.
- **Fait dans le dashboard Supabase (bloquant pour la tâche 4 et pour le
  dev)** : Site URL + Allowed Redirect URLs (`http://localhost:5173/auth/callback`
  et `https://dokat.github.io/LaVoitureAJojo/auth/callback`, D20) ; whitelist
  d'emails (D15) ; protection leaked-password (toujours WARN aux advisors
  2026-11-26) ; provider Google (client ID/secret) s'il n'est pas déjà
  configuré. La vérification reportée du milestone 8 (callback OAuth depuis
  le domaine Pages) se fera avec le test whitelist.
- Mot de passe temporaire de l'admin (notes M2) : toujours à changer — le
  faire dès que le lien de reset fonctionne (le flux existe maintenant).
- `react-router` v8 : le paquet s'importe directement (pas de
  `react-router-dom`) ; `basename={import.meta.env.BASE_URL}` aligne le
  routage sur le base path Pages (D17).

## Milestone 4 — Cœur métier ✅

- [x] `vehiclesRepository`, `kilometersRepository`, `profilesRepository`
- [x] Compression client des photos (canvas ~1600 px / JPEG 80 %, EXIF
      stripped, garde-fou 10 Mo) dans `lib/images.ts` + test unitaire
- [x] Hook `useOdometerValidation` (règle D6 côté client, messages clairs) +
      test
- [x] Hook `useReadings` (liste, ajout avec upload photo, soft-delete)
- [x] Types du domaine dans `src/types/`

Prérequis : milestone 3 (un utilisateur authentifié pour tester).

Notes :

- Écart de protocole assumé : exécuté sur demande explicite alors que la
  tâche manuelle du milestone 3 (test whitelist Google, bloquée par la
  config dashboard) restait due — sans impact ici, rien dans M4 ne dépend
  d'OAuth.
- Couches ajoutées au-delà de la lettre des tâches : `repositories/errors.ts`
  (`DataError` : `km_regression`, `km_immutable`, `permission`, `not_found`,
  `network`, `photo_upload`, `unknown` — les marqueurs des triggers sont
  reconnus par le message, code SQL P0001) et `repositories/photosRepository`
  (storage, que le README de couche listait déjà comme module propre).
  `ProfileRole` a glissé dans `types/domain.ts` ; `authRepository` le
  ré-exporte, aucun appelant changé (suite logique de D22).
- `useReadings` : montage via `fetchAndApply` ; `addReading` sans photo = insert seul ; avec photo =
  compress → insert → upload `{user_id}/{reading_id}.jpg` → attach
  (échec d'upload ⇒ D25) ; `softDelete` retire de la liste sans jamais
  toucher les octets (D7). `lastReading` dérivé du tri de récence, branché
  sur `useOdometerValidation`.
- D6 client figée par tests (cas du contrat : premier relevé, supériorité à
  date ancienne, **égalité acceptée**, rétro-saisie, même instant refusé,
  futur refusé) ; la logique pure `validateOdometer` est exportée pour être
  testable sans React. Le trigger SQL reste la vérité — le client peut
  échouer à dire non (course), la base ne laisse pas passer.
- `lib/images.ts` : OffscreenCanvas + repli DOM ; garde 10 Mo **avant**
  décodage et après encodage ; `computeScaledSize` ne grandit jamais et ne
  réduit jamais à 0 px. Tests avec canvas stubbé (le node de vitest n'a pas
  d'écran).
- 27 tests (3 fichiers) ; `npm test` ajouté aux scripts et à la CI (D23).
  Le client est désormais typé par `src/types/supabase.ts` généré depuis la
  base (D24) ; les conversions `as unknown as` des repositories ont disparu.
- Lint : un seul warning reste, préexistant (`button.tsx`, shadcn). Le
  `react/set-state-in-effect` de `useReadings` est désactivé localement avec
  justification (le fetch de montage est le pattern visé, pas une cascade
  synchrone).
- Session suivante (M5) : `getSignedUrl` est prêt pour la photo cliquable ;
  `ReadingFilters` (`includeDeleted`, `userId`) est prêt pour le toggle et
  le filtre admin (M6) ; le formulaire pré-remplit `readingAt` à « maintenant »
  et passe par `useOdometerValidation` avant `addReading` (D14).

## Milestone 5 — UI v1 ✅

- [x] Dashboard : dernier km, dernier relevé, graphique Recharts (package
      chart shadcn), bouton saisie
- [x] Historique : liste inversée, photo cliquable (signed URL)
- [x] Formulaire de saisie mobile-first : km (clavier numérique), date/heure
      (défaut maintenant, éditable — D14), % essence, notes,
      caméra/photos (`capture`)
- [x] Navigation par routes + layout mobile

Prérequis : milestone 4.

Notes :

- Blocs shadcn ajoutés : `chart` (+ recharts en dépendance, D12), `dialog`
  (visualiseur photo), `textarea`, `badge`. `button.tsx` non écrasé (le CLI
  proposait de le remplacer ; refusé — la version en repo est validée).
  Deux warnings oxlint `only-export-components` s'ajoutent à celui de
  button.tsx : `badge.tsx` exporte `badgeVariants` — propre aux fichiers
  générés shadcn, préexistant par pattern.
- Structure : `features/dashboard|history|readings` (écrans),
  `components/AppShell.tsx` (layout mobile : en-tête + nav basse fixe
  Dashboard/Saisir/Historique), routes `/`, `/saisie`, `/historique`,
  `/compte` protégées sous `<RequireAuth>` + layout ; `AccountPage` déclassé
  de `/` vers `/compte` (l'écran était explicitement transitoire M3).
  Nouvelle couche fine : `hooks/usePhotoUrl` (URL signée à la demande, D16 —
  régénérée à chaque ouverture du visualiseur, jamais au chargement de liste)
  et `lib/format.ts` (formatage fr-FR + conversions datetime-local ↔ Date,
  sémantique locale D14).
- `useReadings` est instancié par écran (pas de store global) : chaque route
  refait son fetch au montage — acceptable à l'échelle D1, à garder en tête
  si M7 introduit un cache.
- D25 implémenté : le formulaire affiche « Relevé enregistré, mais la photo
  n'a pas pu être envoyée : … » quand `addReading` retourne `photoError`.
- Vérifié en réel (browser + projet Supabase, véhicule **Dev** activé le
  temps de la session puis restauré sur Honda) : login compte de test,
  dashboard vide, saisie km+essence+notes+photo → relevé + upload (photo
  rendue à 1600 px : compression D16 confirmée par `naturalWidth`), historique
  trié du plus récent, régression D6 refusée **côté client** avec le message
  du hook, rétro-saisie (49 900 km la veille) acceptée, zéro erreur console.
- **Deux pièges de fixture SQL** (à réutiliser pour tout compte de test) :
  1. `auth.users.instance_id` doit valoir `00000000-0000-0000-0000-000000000000`
     (pas NULL) — sinon GoTrue ne « voit » pas l'utilisateur au login
     (400 invalid_credentials) alors que tous les autres colonnes sont
     alignées. Complément des notes M3 ; l'admin M2 l'avait, d'où la
     confusion possible.
  2. Ne jamais forger un UUID de fixture en `00000000-…-00000000xxxx`
     (version 0) : `zod` (v4, RFC 9562) le refuse dans les schémas D26 →
     lecture PostgREST valide côté HTTP mais `DataError` « Invalid UUID »
     côté client. Utiliser `gen_random_uuid()` (le premier essai de session a
     déclenché ce cas, confirmé comme garde-fou D26 fonctionnel).
- La photo de test reste dans le bucket `photos` (dossier du compte de test) :
  le bucket n'a pas de policy DELETE (octets figés, D7) et `storage.objects`
  refuse le delete SQL direct (trigger de protection) — à purger via le
  dashboard ou service_role si un jour nécessaire. ~85 Ko.
- **Compte membre de test conservé** : `m5-test@example.com` /
  `M5test!verify` (rôle `membre`, UUID à régénérer mentalement — présent en
  base) — prérequis « un compte admin et un compte membre » du milestone 6
  déjà couvert. Mot de passe faible et communiqué en clair : à supprimer ou
  changer après M6, ne touche pas l'historique réel (véhicule Dev).
- Session suivante (M6) : le toggle `includeDeleted` et le filtre `userId` de
  `ReadingFilters` (repo, M4) + `useAuth().isAdmin` sont les seules pièces
  manquantes aux trois premières tâches ; l'UI est prête à les brancher
  (HistoryPage centralise la lecture, AppShell montre déjà le rôle via
  /compte).

## Milestone 6 — Admin & soft-delete ✅

- [x] Toggle « voir les suppressions » + bouton restaurer (admin)
- [x] Sélecteur de véhicule actif (admin) + édition infos véhicule
- [x] Filtre historique « par utilisateur » (admin)
- [x] Interdire en UI toute action réservée aux admins pour un membre
      (la RLS garde la vérité, l'UI ne fait que l'afficher)

Prérequis : milestone 5 ; un compte admin et un compte membre dans Supabase.

Notes :

- **Écarts au contrat actés en D27 et D28** : colonne `profiles.email`
  synchronisée par trigger depuis `auth.users` (indispensable aux libellés du
  filtre — sinon des UUID ; le schéma `auth` n'est pas exposé aux clients), et
  `deleted_by` conservé à la restauration (trace d'audit, D7). Migration
  `20261126180000_profiles_email.sql` appliquée via MCP `apply_migration`
  (même patron que M2 ; le réalignement CLI `db pull` reste dû) et
  `src/types/supabase.ts` **régénéré** dans la foulée (D24) — attention : le
  générateur MCP n'émet plus le bloc `graphql_public`, sans conséquence.
- Gardes base prouvées par `supabase/tests/m6_admin_test.sql` (23/23, exécuté
  cette session, auto-rollbacké) : bascule/édition véhicules silencieuses pour
  un membre, effectives pour l'admin ; restauration membre = 0 ligne (admin
  seul) ; **D18 revérifié** : restauration en conflit → KM_REGRESSION ;
  synchronisation email (insert + update). Un UPDATE « né en conflit » étant
  impossible (le trigger garde l'INSERT aussi), le conflit de restauration se
  construit par chronologie glissante — voir le commentaire de la fixture.
- Bascule du véhicule actif = **deux** écritures séquentielles côté
  `vehiclesRepository.setActiveVehicle` (désactiver les autres puis activer la
  cible) : l'index partiel unique interdit l'inverse. Fenêtre « aucun actif »
  de quelques ms, sans impact à l'échelle D1 ; en cas d'échec, `useVehicles`
  relit la flotte depuis la base (jamais d'optimisme sur un invariant base).
- UI : route `/admin/vehicules` (page `features/vehicle/` + garde
  `RequireAdmin` qui **patiente tant que le rôle n'est pas chargé**, sinon un
  admin serait éjecté pendant le fetch du rôle) ; lien depuis `/compte` visible
  des seuls admins ; historique enrichi (toggle, filtre, boutons par ligne,
  auteur + date de suppression affichés à l'admin) — `ReadingRow` extrait en
  composant propre.
- `useReadings(options)` : filtres `{ includeDeleted, userId }` en primitifs
  (changer l'un relance le fetch) ; `restore` relit après succès et **ne
  prétend à rien sur un refus du trigger** ; `lastReading` ignore désormais les
  lignes mortes (sinon le toggle fausserait la validation D6 du formulaire) ;
  `softDelete` marque la ligne au lieu de la retirer quand le toggle est actif.
- La régénération zod (D26) a rattrapé le contrat : `Profile.email` nullable
  (une ligne née avant la migration n'a pas d'email), anti-dérive contrôlée par
  le type généré.
- Vérifié en réel (browser, véhicule **Dev** activé le temps de la session puis
  Honda restauré, relevés de test purgés) : côté membre — zéro contrôle admin,
  bouton supprimer uniquement sur ses lignes ; côté admin (m5-test promu/
  rétrogradé en base, rechargement = relecture du rôle) — toggle, restauration
  avec badge « Supprimé le … », filtre par utilisateur (emails lisibles),
  bascule aller-retour Honda/Dev, édition modèle Honda faite puis annulée ;
  membre tentant `/admin/vehicules` → renvoyé au dashboard. Zéro erreur
  console.
- Session suivante (M7) : le compteur de relevés est passé à zéro en base
  (fixture M5 purgée avant cette session) ; la file IndexedDB devra passer par
  `useReadings`/`addReading` tels quels — l'item hors-ligne se rejouera via les
  mêmes repos et le trigger D6 reste la vérité au renvoi. Les filtres admin
  n'ont pas de sens hors-ligne : ignorer `includeDeleted`/`userId` dans la
  file.

## Milestone 7 — Offline / PWA ✅

- [x] `vite-plugin-pwa` : manifeste, icônes, installabilité, offline shell
- [x] File IndexedDB (`pending` : km, date locale, blob photo, notes,
      essence)
- [x] Synchroniseur au retour en ligne ; D6 réévaluée à la synchro ; item en
      échec → badge « en attente — conflit », éditable/abandonnable (D13)
- [x] Écran/indicateur « items en attente »
- [x] Test : coupure réseau simulée (DevTools offline) → saisie → réconnexion
      → synchro

Prérequis : milestones 4-5 (la saisie en ligne existe).

Notes :

- Architecture de la file : `lib/pendingStore.ts` (IndexedDB brut + cache
  mémoire + abonnés — IndexedDB n'est pas supabase-js, la règle D10 des
  repositories reste intacte) ; `hooks/usePendingQueue.ts` (binding React via
  `useSyncExternalStore` + **moteur de synchro au niveau module**, garde
  singleton : plusieurs instances montées partagent une boucle). La boucle
  **relit la file à chaque tour** (pas un snapshot figé) — un item qui entre
  pendant la synchro est attrapé, pas renvoyé à l'événement online suivant.
- Sync reprenable en **trois étapes idempotentes** (insert → upload → attach)
  avec reprise sur `insertedReadingId`/`uploadedPhotoPath` : une coupure entre
  l'insertion et l'upload ne provoque JAMAIS de double insertion (esprit
  D25/D7). Erreur réseau → l'item reste `pending` ; erreur déterministe
  (D6, droits, véhicule) → badge « en attente — conflit » + message de la
  base, éditable (re-synchro immédiate) ou abandonnable (confirmé — seule
  sortie hors succès, D13).
- Branche hors-ligne de `useReadings.addReading` : `!navigator.onLine` AVANT
  insert, ou DataError `network` en plein vol → mise en file (photo compressée
  localement d'abord, octets conformes au quota) et retour `{ ok: true,
queued: true }`. **Un refus D6 du trigger ne file jamais** : la base est
  vérité, l'utilisateur corrige son km (test figé). Le véhicule est résolu au
  renvoi s'il était inconnu à la saisie (montage hors-ligne).
- `seq` dans l'item : deux saisies dans la même milliseconde partagent le
  `createdAt` ISO, et `getAll` IndexedDB trie par clé (UUID) — l'ordre
  d'envoi est garanti par (createdAt, seq), sinon la course de tests est
  aléatoire.
- PWA : `vite-plugin-pwa` en `generateSW`/`autoUpdate`, `navigateFallback:
index.html` (shell hors-ligne ; la DONNÉE n'est pas cachée — c'est la file
  IndexedDB qui joue le rôle hors-ligne). Icônes générées par
  `scripts/gen-icons.mjs` (encodeur PNG node/zlib + cadran dessiné en
  géométrie de pixel — aucun binaire graphique à installer). Le plugin aligne
  start_url/scope sur `BASE_PATH` : rien de spécial à faire pour Pages,
  l'installabilité depuis le domaine https reste à vérifier en prod (M8 fait,
  session suivante éventuelle).
- Vérifié en réel (`vite preview` + browser, véhicule **Dev** activé puis
  Honda restauré) : coupure simulée → saisie km+notes+photo → carte « relevé
  mis en file », header « hors-ligne · 1 en attente », item avec aperçu local
  de la photo ; reconnexion (événement `online`) → synchro automatique →
  ligne en base avec `photo_path` posé, file vide, historique affiché. **Zéro
  erreur console** ; precache 16 entrées dont index.html. Conflit prouvé par
  course : relevé 90 000 injecté en base pendant que le formulaire était
  ouvert (le client ne pouvait pas le connaître) → l'item renvoyé est refusé
  par le trigger (n=0 en base) et porte le badge « en attente — conflit »
  avec le message D6 ; l'édition (90 100) le resynchronise aussitôt.
- Piège du test simulé : un toggle DevTools offline n'est pas programmable
  depuis l'agent ; l'override du getter `navigator.onLine` + dispatch des
  événements `offline`/`online` couvre exactement les mêmes chemins de code,
  SAUF que les lectures réseau réussissent encore — ce qui a confirmé au
  passage que le client D6 bloque la régression AVANT mise en file quand il
  le peut (attendu : le client est l'UX, la base la vérité).
- Fixtures restantes dans le véhicule **Dev** (sans effet sur l'historique
  réel, Honda restauré) : 75 210 (avec photo dans le bucket, dossier
  m5-test), 75 300, 90 000 (notes « course M7 »), 90 100. Le compte
  `m5-test@example.com` reste utilisable ; le supprimer/changer après M7 si
  plus rien ne dépend de lui (déjà différé par M5/M6).
- Limite assumée (échelle D1) : l'écran de file vit sous `AppShell` donc
  connecté — hors-ligne avec session expirée, on ne liste pas la file, mais
  elle n'est pas perdue (IndexedDB est par origine, pas par session) et part
  dès la reconnexion. Aucun test E2E DevTools réel dans la CI (pas de
  service worker en vitest ; les chemins offline/conflict/reprise sont figés
  par 17 tests unitaires de plus, 66 au total).
- Session suivante : tous les milestones sont faits — reste la dette (réalignement
  CLI des migrations avant premier usage, purge dashboard du bucket si un
  jour nécessaire, mot de passe admin temporaire encore en place ?) et
  l'installation réelle du PWA depuis Pages.

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

## Milestone 9 — Sorties : base SQL ✅

Contrat : D30-D40. Ce que la session doit produire, tout côté base :

- [x] **Tâche 0 — réalignement migrations locales ↔ distante** (dette rendue
      exigeante par l'installation du CLI, voir Dette) : créer
      `supabase/config.toml` (`npx supabase init`, ou à la main avec le
      `project_id` extrait de `VITE_SUPABASE_URL`), `npx supabase link
--project-ref <ref>`, puis `npx supabase migration repair --status
applied <version>` pour chaque fichier de `supabase/migrations/` (la
      table `schema_migrations` distante ignore nos noms horodatés — elle
      porte les entrées de `apply_migration` M2→M6). Vérifier avec
      `npx supabase db pull --dry-run` : aucune diff de schéma attendue.
      **Pas de `db push` avant** : il rejouerait tout et échouerait.
      Alternative si repair coince : `db pull` (v3 consigne l'historique à la
      volée) puis trier les fichiers.
- [x] Migration `trips` : `id`, `vehicle_id → vehicles`, `start_reading_id →
kilometers` (NOT NULL), `end_reading_id → kilometers` (NULL = en cours),
      `cancelled_at` (NULL), `created_at` ; UNIQUE sur `start_reading_id` ET
      sur `end_reading_id` (D30 — rend le partage du relais légal et le
      double-usage impossible)
- [x] Index partiel UNIQUE `trips(vehicle_id)` WHERE `end_reading_id IS NULL
AND cancelled_at IS NULL` (D35, une sortie ouverte par véhicule)
- [x] Trigger de clôture (D34) : à l'UPDATE posant `end_reading_id`, exiger
      `km(arrivée) ≥ km(départ)` ET `reading_at(arrivée) ≥
reading_at(départ)` ; erreurs typées (`TRIP_KM_ORDER`, `TRIP_DATE_ORDER`)
      reconnues par `repositories/errors.ts` au M10
- [x] Trigger d'insertion `trips` : le contrôle D6 sur le relevé de départ est
      déjà gardé à l'INSERT kilometers (rien à refaire) ; refuser une
      deuxième ouverture sans relais (garde de l'index partiel, message typé)
- [x] **Relais** (D35) : soit dans le trigger d'insertion `trips` (si une
      sortie ouverte existe pour le véhicule → tenter de la clôturer avec
      `NEW.start_reading_id`, refus typé `TRIP_RELAY_CONFLICT` si D34
      violée — jamais de cap implicite), soit fonction SQL explicite ;
      idempotent (rejeu offline, D39)
- [x] Trigger d'annulation/levée (D36) : poser `cancelled_at` ⇔ soft-delete /
      restauration du relevé de départ dans la même transaction ; levée
      recontrôlée par D18 (le trigger D6 existant sur UPDATE
      `deleted_at → NULL` doit suffire — le vérifier en test)
- [x] RLS `trips` : SELECT tout authentifié ; INSERT tout authentifié ;
      UPDATE clôture/annulation par l'auteur du départ OU admin (`is_admin()`)
      ; la suppression d'une sortie clôturée (D33) passe par les policies
      `kilometers` existantes (aucune écriture directe sur `trips` —
      contagion par les relevés)
- [x] Purge du patrimoine pré-sortie (D40) : collecte des `photo_path` des
      lignes `kilometers`, suppression des objets storage correspondants
      (service_role ou dashboard — le bucket n'a pas de policy DELETE, cf.
      notes M5), puis DELETE physique des lignes. Ordre : octets d'abord,
      lignes ensuite (sinon plus rien ne pointe les orphelins)
- [x] Script de test SQL (`supabase/tests/trips_test.sql`, patron
      auto-rollback M2) : ouverture normale ; relais OK (même relevé partagé,
      somme des distances) ; relais refusé (km et date) ; clôture refusée
      (km, date) ; clôture par un non-auteur membre = 0 ligne, admin = OK ;
      annulation → départ invisible de la chronologie ; levée d'annulation
      avec D6 revenue = refus ; restauration par agrégat (D37) ; index une
      sortie ouverte ; purge = tables vides vérifiée dans un rollback
- [x] Régénération (D24) : `npx supabase gen types typescript --linked`
      (CLI installé le 2026-11-27 en devDependency, invocation via `npx`) ou
      outil MCP `generate_typescript_types` — les deux lisent le schéma réel,
      la dette de réalignement des migrations ne bloque **pas** la génération,
      seulement `db push` (cf. tâche 0 et Dette) ; sinon M10 typecheck à
      l'aveugle

Prérequis : milestones 2-7 (la base actuelle est en prod) ; sauvegarde
exportée des `kilometers` avant la purge D40 (dump SQL via dashboard —
l'écart à D7 est acté, pas une raison pour ne pas avoir de filet le jour J).

Choix de l'outil (consigne produit 2026-11-27) : **MCP ou CLI, au plus
pratique pour chaque opération** — le CLI n'impose pas de tout basculer sur
lui, le MCP n'interdit pas le CLI. Contrainte de cohérence seulement :
`db push` CLI exige la tâche 0 faite ; appliquer une migration par MCP
`apply_migration` est toujours possible mais creuse l'écart d'historiques
(la tâche 0 devra l'intégrer). `gen types` : les deux, indifféremment.

Notes :

- **Tâche 0 faite, la dette est soldée** — plus aucune migration MCP :
  `npx supabase init` (v3) crée `supabase/config.jsonc` (pas `config.toml` :
  écart de nommage dû à la version du CLI, sans effet contrat) ; `link`
  fonctionne sans mot de passe (rôle de connexion via API de gestion) ;
  `migration repair --status applied --remote --yes` pour les 10 fichiers
  locaux — le repair v3 **copie les statements des fichiers locaux** dans la
  table distante, qui porte donc désormais exactement le repo. Les entrées
  `apply_migration` M2→M6 (versions 1503xx/1906xx en double) ont été
  réparées en `reverted` (commande suggérée par `db push` qui les refusait).
  Piège v3 : `db pull --dry-run` **n'existe plus** → vérifier l'alignement
  par `db push --dry-run` (attendu `"upToDate": true`), et `db export`
  s'appelle `db dump`. Tout `--remote` qui modifie demande `--yes` en agent.
- Trois migrations poussées via CLI (`db push`, historique CLI unique
  désormais) : `20261127120000_create_trips` (table + UNIQUE D30 + index
  partiel D35 + triggers + RLS), `20261127121000_trip_assert_grant`
  (correctif, cf. piège ci-dessous), `20261127130000_purge_legacy_kilometers`
  (D40, `delete from kilometers` seul).
- Architecture des triggers : `trip_assert_order(start, end, p_relay)`
  centralise D34 (marqueurs `TRIP_KM_ORDER`/`TRIP_DATE_ORDER`, ou
  `TRIP_RELAY_CONFLICT` en contexte relais) ; `trips_before_insert` est
  **SECURITY DEFINER** (le relais clôture la sortie d'autrui — écriture
  hors de portée de l'appelant, verrou `FOR UPDATE` sur la ligne ouverte) ;
  `trips_before_update` est **SECURITY INVOKER** (ses écritures miroir dans
  kilometers — soft-delete du départ à l'annulation, restauration à la
  levée — restent sous les policies de l'appelant ; le droit d'atteindre la
  ligne trips est borné par la policy auteur-du-départ-ou-admin). CHECK
  `trips_not_closed_when_cancelled` (une sortie n'est pas à la fois fermée
  et annulée) ; marqueur additionnel `TRIP_ADMIN_ONLY` (levée d'annulation)
  et garde `TRIP_IMMUTABLE` (id/véhicule/départ/created_at figés ; une
  sortie clôturée ne se réouvre pas).
- **Piège trouvé par le test (règle pour la suite)** : le revoke EXECUTE posé
  sur `trip_assert_order` bloquait toute clôture par un rôle authentifié —
  un trigger SECURITY INVOKER appelle ses helpers **dans le contexte de
  l'appelant**. D'où la migration 121000 qui rend EXECUTE à authenticated
  (lecture seule des relevés, aucune écriture exposée). Les triggers
  eux-mêmes restent non appelables par RPC.
- **D40 exécuté** avec confirmation produit : 5 lignes `kilometers` (toutes
  sur véhicule Dev — Honda n'a jamais eu de relevé) et 2 octets JPEG
  supprimés (le référencé + un orphelin `91cfe55b-….jpg` découvert au `ls`
  — purgé aussi, c'est l'objet de D40). Bucket `photos` vérifié vide
  (`storage.objects` = 0), `kilometers` = 0, `trips` = 0. Ordre respecté :
  octets d'abord via CLI `storage rm` (expérimental v3, URIs `ss:///…`),
  lignes ensuite via la migration. **Filet** : dump SQL rejouable dans
  `supabase/.temp/kilometers-pre-D40-20261127.sql` (gitignoré — repo public).
  D7 redevient intégral pour toute donnée née après cette purge.
- Test SQL : `supabase/tests/trips_test.sql`, **53/53** (exécuté via
  `npx supabase db query --remote --yes --file` — un seul trait, auto-
  rollback vérifié : 0 résidu users/véhicules/lignes). Patron m6 (juge par
  l'état + `pg_temp.juge` étendu : le marqueur d'erreur est extrait du
  message et jugé pour de vrai, et `check_violation`/`unique_violation` sont
  dans les exceptions reconnues). Deux véhicules jetables : la chronologie
  du conflit de levée D18 exige une vivante à date ≥ du départ (même date,
  km supérieur) — d'où VB dédiée ; le scénario D40 (purge des deux tables
  dans le rollback) y est répété.
- `src/types/supabase.ts` régénéré (`gen types --remote`, CLI) après la
  migration trips ; la purge étant data-only, rien à regénérer ensuite.
  66 tests vitest, lint (warnings préexistants seuls), build — au vert.
- Session suivante (M10) : les marqueurs à reconnaître dans
  `repositories/errors.ts` sont `TRIP_KM_ORDER`, `TRIP_DATE_ORDER`,
  `TRIP_RELAY_CONFLICT`, `TRIP_IMMUTABLE`, `TRIP_ADMIN_ONLY` (+ les
  existants `KM_REGRESSION`, `KM_IMMUTABLE`, `permission`…). Attention :
  `is_admin()`/`auth.uid()` en trigger → SQL P0001 avec le message en
  préfixe, comme les triggers existants. La **levée d'annulation est un
  seul UPDATE sur trips** (le trigger restaure le départ tout seul) —
  `restoreTrip` d'une sortie annulée n'est pas « trois écritures » ; la
  restauration par agrégat d'une sortie supprimée reste deux UPDATE sur
  kilometers (départ puis arrivée, chacun sous D18). `deleteTrip` = deux
  soft-dletes de relevés, jamais d'écriture sur trips. Le rejeu offline
  d'une ouverture se reconnaît à `unique_violation` sur
  `trips_start_reading_id_key` (déjà ouverte) et d'une annulation
  replayable = UPDATE idempotent côté trigger. Le relais se pilote
  simplement : insérer `trips` avec son nouveau relevé de départ — le
  serveur clôture l'ancienne sortie ou refuse typé. Véhicule Dev et compte
  `m5-test` conservés (décision session, utile aux vérifications M11).

## Milestone 10 — Sorties : client ⬜

Contrat : D30-D39 côté TypeScript. Rien d'visible à l'écran (l'UI reste en
M11), mais `npm run build`/`lint`/`test` au vert sur les nouvelles couches.

- [ ] Schéma zod `src/schemas/trips.ts` (D26) : ligne PostgREST → forme
      domaine `Trip` (camelCase, `startedAt`/`endedAt` dérivés des relevés,
      `distanceKm` dérivée — ou laissée au hook, trancher en session)
- [ ] `tripsRepository` : `fetchTrips(vehicleId)`, `openTrip` (insère le ou les
      relevés puis la ligne — dans l'ordre qui respecte UNIQUE et D34),
      `closeTrip`, `cancelTrip`, `restoreTrip` (D37 : les trois écritures),
      `deleteTrip` (soft-delete des deux relevés). Seule couche qui parle
      supabase-js (D10) ; erreurs trigger → `TripError` typées, messages FR
- [ ] `kilometersRepository` : étendre le mapping si les jointures `trips`
      remontent les relevés par sortie ; les lectures existantes (liste,
      `includeDeleted`) ne bougent pas — l'historique par sortie se construit
      côté hook en joignant par id, pas en complexifiant le repo
- [ ] Hook `useTrips(vehicleId)` : sortie en cours (`openTrip` dérivé),
      liste enrichie des relevés, `startTrip` (dont rétroactif D31),
      `completeTrip`, `cancelTrip`, `deleteTrip`, `restoreTrip` ; branché sur
      `useOdometerValidation` pour les validations AVANT envoi (D6 reste
      l'UX, la base la vérité) + règle interne D34 re-jouée côté client
- [ ] Offline (D39) : l'item de file gagne un champ d'intention
      (`tripOpen` / `tripClose` + relevés) ; le synchroniseur rejoue
      lecture(s) puis écriture `trips`, idempotent sur `insertedReadingId` ;
      le relais est une simple insertion qui réussit — pas de branche
      « conflit » dédiée, conflit uniquement sur erreur déterministe ;
      écran/indicateur de file existants mentionnent l'intention sortie
- [ ] Tests vitest (D23) : relais avec même relevé, ouverture rétroactive,
      annulation = 2 écritures cohérentes, restauration agrégat, file offline
      `tripOpen`/`tripClose` en reprise de coupure ; les fixtures mockent
      `tripsRepository` à sa frontière

Prérequis : milestone 9 appliqué sur le projet Supabase.

Notes :

- (à remplir par la session M10)

## Milestone 11 — Sorties : UI ⬜

Contrat : D30-D39, D38 pour l'affichage.

- [ ] `/saisie` devient le flux sortie : carte « Sortie en cours » (départ,
      depuis quand, qui) avec formulaire **Terminer** ; sinon formulaire
      **Démarrer une sortie** (km + date + photo/essence/notes départ) avec
      repli « sortie rétroactive » (deux blocs départ/arrivée, D31) ;
      le formulaire de relevé brut existant est supprimé
- [ ] Relais (D35) : détection d'une sortie ouverte par autrui ⇒ confirmation
      explicite (« votre relevé clôturera la sortie en cours de X ») avec
      alert-dialog ; message d'échec typé `TRIP_RELAY_CONFLICT` / D34
      (jamais de blocage silencieux)
- [ ] Historique par sortie (D38) : ligne = départ → arrivée + distance +
      auteur(s) ; toggle admin « voir les suppressions » inclut annulées
      (D36) ; actions restaurer/supprimer par agrégat (D33/D37) ; graphique
      inchangé
- [ ] Dashboard (D38) : dernier km connu, carte sortie en cours avec bouton
      **Terminer** ; badge file offline adapté aux intentions sortie
- [ ] Vérification en réel mobile-first (D11) : ouvrir → clôturer ; relais
      entre deux comptes ; annulation ; rétro-saisie ; une session hors-ligne
      complète ouverture + clôture avec synchro au retour (patron M7)
- [ ] `npm run build` + `lint` + `test` au vert ; notes de session écrites

Prérequis : milestone 10.

Notes :

- (à remplir par la session M11)

## Dette / points de vigilance

- Régénérer `src/types/supabase.ts` (`supabase gen types typescript`) après
  chaque migration (D24) : sinon le typecheck ne protège plus le contrat
  base ↔ client.
- Cohérence D6 entre trigger SQL et hook client : le trigger est la source de
  vérité, le client ne fait que l'UX.
- IndexedDB + photos : résolu au milestone 7 — un item sort de la file dès sa
  synchronisation (les octets ne persistent qu'en cas de conflit en attente).
- La whitelist d'emails Supabase s'applique aussi à OAuth Google — à tester
  explicitement au milestone 3.
- Ne jamais embarquer la clé `service_role` dans le bundle (repo public).
- Réalignement migrations locales ↔ distantes : **fait à la session M9
  (2026-11-27)** — repair `applied` des 10 fichiers + repair `reverted` des
  doublons `apply_migration`, puis trois nouvelles migrations poussées par
  CLI (`db push`). L'historique distant porte exactement les fichiers du
  repo ; la dette est soldée, toute nouvelle migration se fait par CLI.
  Contrôle rapide : `npx supabase db push --dry-run --remote` → `upToDate`.
