# Décisions de design — LaVoitureAJojo

Arbre des décisions validé avec le produit le 2026-11-26 (session de
grillage). Chaque nœud : la question, la décision prise, le pourquoi, ce que
ça débloque. Toute modification ultérieure doit ajouter une entrée ici (avec
date) plutôt qu'éditer silencieusement une entrée existante.

## 1. Cadre produit

### D1 — Public cible et échelle

App familiale/covoiturage proche : 10-20 utilisateurs maximum, plan **gratuit**
Supabase. Inscription verrouillée par whitelist d'emails (cf. D15).

### D2 — Modèle véhicule

**Une seule voiture partagée par tous les utilisateurs** (covoiturage
familial) : tout le monde alimente le même historique de kilométrage. Pas de
notion de « véhicule de l'utilisateur ». Débloque : RLS ouverte en écriture à
tout utilisateur authentifié, et rend la règle anti-recul (D6) cruciale —
deux personnes peuvent saisir dans le désordre.

### D3 — Environnements

**Un seul projet Supabase** pour la prod et le dev. Le dev passe par un
**véhicule de test** supplémentaire dans la table `vehicles`, que l'admin
active/désactive. Choix assumé : promiscuité dev/prod en échange d'une seule
config à payer et à maintenir.

## 2. Fonctionnalités v1

### D4 — Périmètre v1

- Dashboard : dernier kilométrage + graphique d'évolution (Recharts).
- Historique : liste chronologique des saisies.
- Formulaire de saisie.

Export CSV, alertes « pas de saisie depuis X jours », purgeur de photos
orphelines : v2.

### D5 — Champs d'une saisie

Kilométrage (km), date/heure du relevé, photo (optionnelle), notes
(optionnelles), **niveau d'essence en % (optionnel)**. Pas de GPS.

### D6 — Règle anti-recul du compteur

Comparaison à la saisie la plus récente par date :

- `km saisi ≥ km dernier` : accepté.
- `km saisi < km dernier` : accepté **seulement si** `date saisie` est
  **strictement inférieure** à la date de la dernière saisie.

Donc : rétro-saisie d'un relevé oublié = OK ; « remettre le compteur à
l'heure » vers le bas = interdit. Égalité de km acceptée ; deux saisies le
même jour avec km inférieur = refusée. Contrôlé en base (trigger SQL,
milestone 2) et dans l'UI (message explicite).

### D7 — Immutabilité et suppression douce

Pas d'édition du kilométrage : erreur = suppression puis ressaisie. La
suppression est **douce** : la ligne reste en base, taguée (`deleted_at`,
`deleted_by`, `restored_at`). Les saisies supprimées sont invisibles par
défaut (historique et graphique). Toggle « voir les suppressions » et
restauration réservés à l'admin. Rien n'est jamais purgé physiquement en v1 —
les photos suivent le même sort : une suppression douce ne supprime aucun
octet en storage.

### D8 — Rôles et permissions

- **Membre** : voit tout l'historique du véhicule actif, ajoute des saisies,
  soft-supprime **les siennes**.
- **Admin** : tout membre + soft-supprime les saisies d'autrui, restaure,
  édite les infos du véhicule (marque, modèle, plaque), **seul à basculer le
  véhicule actif** (vraie voiture / véhicule de dev), dispose du filtre « par
  utilisateur » dans l'historique.
- Promotion admin : à la main en base (`profiles.role`), pas d'écran de
  gestion de comptes en v1. Whitelist d'emails : dashboard Supabase, pas
  d'écran in-app.

## 3. Technique

### D9 — Stack

SPA **Vite + React + TypeScript** + **Tailwind CSS 4** + **shadcn/ui** +
**@supabase/supabase-js**. Pas de Next.js : Supabase fournit l'auth, la BDD et
le storage.

### D10 — Architecture interne (bonnes pratiques)

- Petits composants composables ; `components/ui` = briques shadcn générées.
- **Hooks pour la logique métier** (`useAuth`, `useReadings`,
  `useOdometerValidation`, `usePendingQueue`…).
- **Repositories pour les accès base** : seule couche qui importe
  supabase-js pour les données ; les erreurs sont converties en erreurs
  typées.
- Découpage par feature (`features/auth`, `features/readings`…).
- Lint : oxlint (fourni par le template Vite) ; format : Prettier.

### D11 — Mobile-first

Saisie principalement au bord de la voiture depuis un smartphone : design
mobile-first + bouton caméra direct (`<input capture>`). PC utilisable pour
l'historique.

### D12 — Graphiques

Recharts via le package chart de shadcn/ui.

### D13 — PWA / hors-ligne

**PWA installable** avec **saisie hors-ligne réelle** : file d'attente
IndexedDB (km, date locale, photo, méta) + synchronisation au retour du
réseau. La règle D6 est réévaluée à la synchro ; l'item hors-ligne, daté au
moment de la manipulation utilisateur (cf. D14), se réinsère rétroactivement
dans la chronologie. Si la validation échoue quand même : l'item reste en
file avec un badge « en attente — conflit », éditable ou abandonnable.
**Jamais de suppression silencieuse d'une donnée locale.**

### D14 — Sémantique de la date d'une saisie

`reading_at` = **moment où l'utilisateur fait la manipulation dans l'app**
— pas l'insertion en base, qui peut être différée par le mode hors-ligne.
Pré-remplit à « maintenant », éditable (relevé fait plus tôt dans la
journée). Les comparaisons de D6 utilisent cette date.

### D15 — Authentification

Email + mot de passe **et** OAuth Google, réinitialisation par email.
**Whitelist d'emails** dans la config Supabase Auth : toute inscription hors
liste est refusée, y compris via un compte Google valide (sinon la RLS
partagée exposerait l'historique à n'importe qui).

## 4. Photos & storage

### D16 — Bucket et traitement client

Bucket **privé** : lecture par utilisateurs authentifiés (signed URLs),
écriture par l'auteur. **Compression côté client avant upload** : ~1600 px de
large, JPEG qualité ~80 % (≈ 300-500 Ko par photo), réencodage qui strippe les
EXIF (et donc tout GPS éventuel). Fichier brut > 10 Mo refusé à l'upload.
Quota gratuit ≈ 1 Go = ~2 000-3 000 photos.

## 5. Hébergement & CI

### D17 — GitHub Pages

Dépôt **public** (exigence Pages gratuit — acceptable : seules l'URL Supabase
et la clé _anon_, publiques par conception, y figurent ; la clé service_role
ne quitte jamais la configuration serveur de Supabase). Build Vite +
publication par **GitHub Actions** à chaque push sur `main`, env vars en
Secrets GitHub.

## 6. Modèle de données (schéma cible)

```
profiles   (id → auth.users, role 'admin' | 'membre')
vehicles   (id, brand, model, plate, is_active)   -- inclut le véhicule de dev
kilometers (id, vehicle_id → vehicles, user_id → profiles,
            km integer, fuel_percent integer null, photo_path text null,
            notes text null, reading_at timestamptz,
            deleted_at timestamptz null, deleted_by uuid null,
            restored_at timestamptz null,
            created_at timestamptz default now())
```

Policies RLS cible : SELECT pour tout authentifié ; INSERT pour tout
authentifié (sur le véhicule actif, avec trigger de contrôle D6) ;
soft-delete par l'auteur ou un admin ; restauration par admin seulement.

## 7. Clarifications d'implémentation (2026-11-26, session milestone 2)

Règle du repo : un écart au contrat s'ajoute ici daté, jamais une réécriture
silencieuse. Ces deux points précisent D6/D7 côté SQL sans les contredire.

### D18 — D6 recontrôlé à la restauration, pas à la suppression douce

Le trigger anti-recul s'applique à l'insertion **et** à l'update qui remet
`deleted_at` à NULL (restauration admin) : une restauration doit respecter la
chronologie comme une insertion. À l'inverse, soft-delete (passage à
`deleted_at` non NULL) n'est jamais bloqué par D6 — retirer une ligne de la
chronologie est toujours possible (sinon supprimer le dernier relevé, qui est
justement le cas d'usage du soft-delete, serait interdit).

### D19 — Immutabilité D7 gardée par trigger de colonnes

« Pas d'édition du kilométrage » est techniquement une interdiction d'UPDATE
sur `km`, `reading_at`, `vehicle_id`, `user_id`, `created_at` (trigger
`kilometers_immutable`). Restent modifiables : `photo_path` (la photo est
uploadée après l'insertion, son chemin contient l'id du relevé — D16),
`notes`, `fuel_percent`, `deleted_*`, `restored_at`. Erreur typée
`KM_IMMUTABLE` pour que les repositories la convertissent (D10).

## 8. Réorganisation et clarifications (2026-11-26, session milestone 8)

### D20 — Milestone 8 exécuté avant les milestones 3-7

À la demande produit : le dépôt GitHub est relié, on câble le déploiement
maintenant. Conséquence assumée : la vérification « de visu » des signed URLs
et du callback OAuth depuis le domaine Pages (dernière tâche du milestone 8)
est impossible — l'app est encore un placeholder sans auth ni saisie. Elle est
reportée à la session du milestone 3, la plus ancienne dépendante de ce point.
Le domaine Pages devient une donnée du contrat :
`https://dokat.github.io/LaVoitureAJojo/` (URL à déclarer dans les redirect
URLs de Supabase Auth quand le flux OAuth existera).

### D21 — La clé « publishable » remplace la clé « anon » (D17 inchangée)

Le projet Supabase livre une clé `sb_publishable_…` (nouvelle génération) qui
remplace la clé anon JWT `eyJ…` avec le même rôle : clé publique, soumise à la
RLS. D17 (« seules l'URL et la clé publique figurent dans le dépôt ») reste
vraie. Décision de nommage : le nom de variable `VITE_SUPABASE_ANON_KEY` est
conservé dans le code, `.env.example` et les secrets GitHub ; la valeur peut
être l'une ou l'autre des deux formes de clé.

## 9. Clarifications d'implémentation (2026-11-26, session milestone 3)

### D22 — Lecture du rôle rattachée à l'auth, pas à un profilesRepository

La tâche « rôle chargé depuis `profiles` au login » est une lecture
d'identité de session, pas un CRUD de profil : elle vit dans
`authRepository.fetchProfileRole()`. `profilesRepository` (milestone 4) garde
sa définition — accès généraux aux profils (afficher des utilisateurs, etc.).
Le rôle n'est **jamais** lu depuis le JWT (il ne le porte pas, cf. commentaire
de la migration `profiles`) ; défaut prudent : profil absent ou erreur de
lecture ⇒ `membre`.

## 10. Clarifications d'implémentation (2026-11-26, session milestone 4)

### D23 — Test unitaire : vitest, local-only, branché dans la CI

Les tâches « test unitaire » du milestone 4 n'avaient pas de framework choisi
(M1 avait livré lint + format, pas de test). Décision : **vitest**
(config `vitest.config.ts`, alias `@/` partagé avec Vite), environnement
`node` par défaut, `jsdom` + `@testing-library/react` uniquement pour les
hooks (`renderHook`). Aucun test n'atteint Supabase : les gardes base
(D6/D7/RLS) restent prouvées par les scripts SQL de M2 ; côté client, les
repositories sont mockés à leur frontière. Le workflow Pages lance
`npm run test` entre lint et build.

### D24 — Les types générés gouvernent le client Supabase

`src/types/supabase.ts` (généré depuis le projet réel par
`supabase gen types`, posée en session M4) paramètre
`createClient<Database>` : les repositories reçoivent des lignes PostgREST
typées et les convertissent en types du domaine (`src/types/`). Le fichier
n'est pas de la dette vivante : **à régénérer après chaque migration**, sinon
le typecheck ne protège plus rien.

### D25 — Échec d'upload photo après insert : relevé conservé, `photoError`

Le chemin D16 (nom d'objet = id du relevé) oblige à insérer **avant**
d'uploader. Si l'insertion réussit mais que l'upload/attach échoue : le
relevé est gardé (visible, sans photo), la liste est rechargée depuis le
serveur et `addReading` retourne `{ ok: true, photoError }` — jamais de
réinsertion, jamais de perte silencieuse (esprit D7/D13). L'UI du milestone 5
doit afficher ce message.

### D26 — Zod source de vérité des types du domaine (26/11/2026)

À la demande de l'utilisateur, en amont du milestone 3 : les types échangés
par les hooks et les signatures de repositories (`Vehicle`, `Reading`,
`Profile`, `ProfileRole`) sont désormais **inférés de schémas zod**
(`src/schemas/`, un fichier par agrégat).
Chaque schéma décrit la ligne PostgREST (snake_case, `timestamptz` en ISO) et
se transforme lui-même en forme domaine (`Date`, camelCase) ; les repositories
font `schema.parse(row)` — le mapping manuel disparaît. Les types du domaine
sont les `z.output` des schémas, importés en `import type` directement depuis
`src/schemas/` par les hooks et composants : `src/types/domain.ts`, qui n'était
plus qu'un pôle de ré-export, est supprimé (le dossier `types/` ne garde que
le fichier généré, D24).

- **D24 est amendée, pas contredite** : `src/types/supabase.ts` reste généré
  et paramètre `createClient` (noms de colonnes des requêtes) ; le zod ajoute
  la validation de forme à la frontière, avec un contrôle de type anti-dérive
  (`Exclude<…, keyof Row>`) qui interdit à un schéma de citer une colonne
  absente du type généré. Une ligne hors schéma lève un `ZodError` converti
  en `DataError` (lecture, jamais insert).
- La règle D8 « jamais de promotion par défaut » est figée par
  `dbProfileRoleSchema` (`.catch('membre')`), utilisée par
  `profilesRepository` **et** `authRepository.fetchProfileRole`.
- Les bornes zod reflètent les check SQL (`km >= 0`, fuel 0–100, rôle) : le
  client ne réinvente rien, il vérifie ce que la base garantit.
- Les règles métier (D6, D7, D19) restent gardées en base ; zod ne valide
  que la forme, pas la chronologie.

## 11. Clarifications d'implémentation (2026-11-26, session milestone 6)

### D27 — `profiles.email` : colonne copiée depuis auth.users pour les libellés

Le filtre historique « par utilisateur » (D8) et l'auteur affiché exigent
d'identifier les utilisateurs autrement que par un UUID. `auth.users.email`
n'est pas exposé aux clients (schéma `auth` hors PostgREST) et le modèle §6 ne
prévoyait rien : la table `profiles` gagne donc une colonne `email` (nullable),
synchronisée depuis `auth.users` par trigger `on_auth_user_email_synced`
(AFTER INSERT OR UPDATE OF email ; `sync_profile_email()` SECURITY DEFINER,
durcie comme `handle_new_user()` — pas d'EXECUTE public), plus un backfill.

- **Vie privée assumée** : la policy existante « profils lisibles par tout
  authentifié » rend ces emails visibles de tout membre du cercle (whitelist,
  10-20 personnes, D1) — cohérent avec D8 où tout membre voit déjà les saisies
  nominatives de tous. Aucun nouveau droit d'écriture.
- Le modèle §6 devient : `profiles (id → auth.users, role, email)`.
- Les régénérations de types (D24) et le schéma zod (D26) suivent : `Profile`
  porte `email: string | null`.

### D28 — Trace d'audit conservée à la restauration

Restauration (admin) = `deleted_at → NULL` + `restored_at = now()` ; `deleted_by`
**n'est pas effacé** : il reste la trace de qui avait supprimé (D7 parle de
lignes « taguées », pas d'un nettoyage des tags). Le recontrôle D6 à la
restauration (D18) est le trigger existant — aucune écriture SQL nouvelle côté
kilomètres.
