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

## 12. Clarifications d'implémentation (2026-11-26, session milestone 7)

### D29 — Renvoi de la file : trois étapes reprenables, jamais de doublon

Un item hors-ligne se synchronise en étapes idempotentes — insertion SQL, puis
upload des octets (`{user_id}/{reading_id}.jpg`, D16), puis collage de
`photo_path` — l'item portant `insertedReadingId`/`uploadedPhotoPath` pour que
la reprise après une coupure en plein envoi **ne réinsère jamais** (cohérent
avec D25 : le relevé existe ou n'existe pas, jamais deux fois). Erreur réseau
⇒ l'item reste `pending` (nouvel essai au prochain online) ; erreur
déterministe (D6, droits, véhicule actif absent) ⇒ `conflict` avec le message
de la base, éditable ou abandonnable (D13). Une régression D6 détectée par le
client avant envoi **ne met jamais en file** : elle est refusée comme en ligne
— la file n'accepte que l'incertitude du réseau, pas l'oubli de la chronologie.

## 13. Modèle « sortie » (2026-11-27, session de grillage produit)

Remplacement de la saisie brute par la **sortie** : une sortie = une saisie au
départ puis une saisie à l'arrivée ; en cours tant que l'arrivée manque. Les
décisions ci-dessous amendent/transposent D4-D7, D13-D14, D18-D19, D29 aux
points cités ; tout le reste de ce qui précède reste en vigueur.

### D30 — Définition et stockage de la sortie

Nouvelle table `trips` (nom technique en base et en code ; **« sortie »**
partout dans l'UI) : une sortie lie **deux relevés existants** de
`kilometers` — `start_reading_id` (départ, non NULL) et `end_reading_id`
(arrivée, NULL tant qu'en cours), plus `cancelled_at` (D36) et `created_at`.
Le kilométrage n'est jamais stocké ailleurs : graphique, historique, RLS,
soft-delete restent natifs de `kilometers` ; `trips` n'est qu'une couche de
liaison (choix A du grillage — tout l'écosystème D6/D7/D13 survit sans
réécriture). Contraintes : chaque relevé apparaît **au plus une fois** comme
`start_reading_id` et **au plus une fois** comme `end_reading_id` (UNIQUE par
colonne — c'est ce qui permet le partage du relais, D35).

### D31 — Disparition de la saisie directe ; sortie rétroactive

La saisie « hors sortie » disparaît de l'UI : tout passe par
ouvrir/clôturer une sortie. Effet de bord assumé : plus de relevé
« essence sans rouler » (cas d'usage absent du produit). Une sortie peut être
**rétro-saisie** : au moment d'ouvrir, on peut renseigner départ **et** arrivée
avec leurs dates (éditables, D14) → la sortie naît clôturée. La rétro-saisie
de D6 survit donc, sous forme de sortie.

### D32 — Champs par extrémité

Photo, % essence et notes restent **par relevé**, optionnels aux deux
extrémités (option A) : la photo du compteur au départ est le justificatif
d'une sortie partagée, celle du retour la preuve du retour. Rien n'est
ajouté au niveau `trips`.

### D33 — Droits et immuabilité sur une sortie

- **Clôturer** : l'auteur de la sortie (celui qui l'a ouverte) ou un admin.
  Un membre ne clôture pas la sortie d'autrui (asymétrie assumée, l'admin
  débloque).
- **Annuler** (sortie en cours) : miroir exact — auteur ou admin.
- **Supprimer** (sortie clôturée) : auteur (de celles qu'il a ouvertes) ou
  admin ; l'action soft-delette **les deux relevés** (`deleted_by` =
  l'exécutant) et la sortie disparaît de la chronologie par contagion.
- **Aucune édition de km/date**, ni au départ ni à l'arrivée : D7/D19 en
  vigueur — corriger = annuler + redémarrer, ou supprimer + ressaisir en
  rétroactif (D31 le permet). Seuls `photo_path`, `notes`, `fuel_percent`
  restent modifiables.

### D34 — Règle chronologique transposée (amendement de D6)

D6 s'applique à chaque relevé inséré comme avant (départ ≥ dernier relevé
chronologique, rétro-saisie tolérée à date strictement antérieure). À la
clôture s'ajoute une règle interne à la sortie, trigger SQL + message UI :
`km_arrivée ≥ km_départ` **et** `date_arrivée ≥ date_départ` (égalités
acceptées — sortie sans rouler possible).

### D35 — Une seule sortie ouverte ; le relais

Index partiel UNIQUE sur `trips(vehicle_id)` WHERE `end_reading_id IS NULL
AND cancelled_at IS NULL` : une sortie ouverte à la fois par véhicule. Démarrer
pendant qu'une sortie **oubliée** est ouverte déclenche le **relais** : le
relevé de départ du nouveau venu clôt automatiquement la sortie en cours —
le **même relevé** sert d'arrivée à l'ancienne sortie et de départ à la
nouvelle (D30 ; compteur continu, somme des distances = distance réelle).
Garde-fous : si le km ou la date du relais violent D34 (compteur lu plus bas
que le départ oublié), **refus typé** avec message explicite (« vérifiez le
compteur, ou demandez à l'admin ») — jamais de cap implicite. L'UI affiche une
**confirmation explicite** avant envoi : « votre relevé clôturera la sortie en
cours de X ».

### D36 — Trace d'annulation

Annuler = `trips.cancelled_at = now()` + soft-delete du relevé de départ
(sinon un faux départ pollue la chronologie et bloque le véhicule via D6).
Rien n'est purgé (esprit D7) : la sortie annulée est invisible par défaut,
visible du seul toggle admin « voir les suppressions ». La levée
d'annulation (admin) remet `cancelled_at` à NULL et restaure le départ, sous
le recontrôle D18.

### D37 — Restauration par agrégat

L'unité de restauration est la **sortie**, plus le relevé pris seul :
restaurer une sortie restaure ses deux relevés + la ligne `trips` (et défaire
une annulation = restaurer le départ + lever `cancelled_at`). Un relevé
orphelin (hors sortie) se restaure individuellement. Le trigger D6/D18
recontrôle la chronologie à chaque restauration.

### D38 — Affichage

- **Historique** : liste **par sortie** — départ → arrivée, distance
  (`km_end − km_start`), dates, auteur(s), badges offline/soft-delete
  existants.
- **Graphique** : inchangé — la chronologie native `kilometers` reste les
  points (arrivées + départ de la sortie ouverte).
- **Dashboard** : dernier km connu = dernière arrivée ; s'il y a une sortie
  en cours, carte visible « Sortie en cours depuis… » avec le km de départ et
  le bouton **Terminer** (accès principal à la clôture).

### D39 — Hors-ligne : cycle complet des sorties (amendement de D13/D29)

Ouvrir, clôturer, annuler, relayer fonctionnent hors-ligne : l'item de file
porte l'intention sortie (création/`trips` update) **plus** ses relevés,
rejoués dans l'ordre qui préserve les contraintes (lecture, puis ligne
`trips`). Le **relais à la synchro** est l'application côté serveur du même
trigger (D35) : un item « ouvrir en relais » synchronisé réussit sans badge
conflit du seul fait qu'une sortie était ouverte ; il ne revient en conflit
(éditable/abandonnable, D13) que sur échec déterministe D6/D34. Idempotence :
jamais de double insertion ni de double clôture (D29 étendu, pas
démenti).

### D40 — Purge physique du patrimoine pré-sortie (amendement de D7)

La migration M9 **supprime physiquement** (DELETE) toutes les lignes
`kilometers` existantes et **les octets JPEG** du bucket `photos` qu'elles
référencent (objets orphelins — sinon ils mangent le quota de D16 sans
métadonnée pour les retrouver). Écart unique et daté à D7 (« rien n'est
jamais purgé ») : quelques semaines de données familiales que le nouveau
modèle rend dénuées de sens — pas de conversion, pas de cimetière legacy.
D7 redevient intégral pour toute donnée née après la migration.

### D41 — Découpage en milestones

La bascule est découpée en trois sessions (extensibles si l'une dérive en taille) :
**M9** base SQL (table, triggers, RLS, relais, purge), **M10** client
(repositories, schemas zod, hooks, offline), **M11** UI (ouvrir/clôturer,
historique par sortie, dashboard, admin). Détail du contrat d'interface dans
`plan-execution.md`.

## 14. Clarifications d'implémentation (2026-11-28)

### D42 — Carte « Dernières sorties » du dashboard

Le dashboard montre les **2 dernières sorties clôturées** (récence
`created_at`, repository ; la sortie en cours a déjà sa carte D35).
Contrairement à l'historique (D38), affichage condensé sans actions ni
photos : distance totale (`km_arrivée − km_départ`), départ (km + date),
arrivée (km + date) et l'auteur qui a enregistré la sortie (utilisateur du
relevé de départ, libellé D27). Le verdict « vivante » est **monté dans le
hook** (`isLiveTrip`, `useTrips`) : historique et dashboard partagent la
même règle (ni annulée D36, ni supprimée par contagion D33) — jamais
réécrite dans un composant.

### D43 — Le graphique d'évolution quitte le dashboard pour l'historique

Amendement de D38 (emplacement uniquement) : la carte « Évolution du
compteur » (Recharts, D12) est déplacée du dashboard vers l'historique,
au-dessus de la liste des sorties. Les points ne changent pas — la
chronologie native `kilometers` vivante (arrivées + départ de la sortie
ouverte) ; le toggle admin « voir les suppressions » n'affecte donc pas la
courbe (les lignes mortes sont filtrées à l'entrée de la carte). Le
dashboard garde le dernier km connu et les cartes de sorties (D38/D42) ;
l'historique se nourrit de `trips.readings`, déjà chargé par `useTrips`,
sans requête supplémentaire. Composite : `features/history/OdometerChartCard`.

## 15. Sélection du véhicule par navigateur (2026-11-28, session corrective)

### D44 — Le véhicule courant n'est plus en base : choix par navigateur

Bug produit remonté : changer le véhicule depuis un navigateur le changeait
partout — le « véhicule actif » global (D3/D8) est inutilisable avec la flotte
réel + dev. Décision : **le véhicule courant est un choix mémorisé dans le
localStorage du navigateur**, sans aucune écriture Supabase.

- **D8 amendée** : l'admin n'a plus la bascule (supprimée de
  `/admin/vehicules`, qui garde l'édition des infos). Chacun choisit le
  véhicule de SON navigateur dans l'en-tête de l'app (`AppShell`, liste de la
  flotte, coche sur le courant).
- **D3 amendée, dans le bon sens** : le dev pointe son navigateur sur le
  véhicule de test sans toucher à la sélection de la famille.
- **Modèle §6 amendé** : `vehicles (id, brand, model, plate)` — la colonne
  `is_active` et l'index partiel `vehicles_one_active_at_a_time` disparaissent
  (migration `20261128170000_vehicle_selection_local.sql`).
- **RLS amendée** : la policy « ajout de releves sur le vehicule actif »
  devient « ajout de releves sur un vehicule **existant de la flotte** » —
  sinon la base refuserait d'écrire sur tout véhicule non désigné « actif »,
  ce qui contredirait le modèle entier. Le filet « hors flotte ⇒ refus » est
  prouvé par `rls_smoke_test.sql` (R5/R5b) et `m6_admin_test.sql` (V2/V4).
- Client : `lib/vehicleSelection.ts` parle à localStorage (patron
  pendingStore : la règle D10 « repositories = seule couche supabase-js » est
  intacte). Résolution au montage : choix mémorisé **encore présent dans la
  flotte**, sinon premier véhicule par date de création — le réel du seed.
  Un choix périmé (véhicule retiré, stockage vidé) retombe donc sans erreur.
  `useActiveVehicle` garde son contrat (résout `vehicle` pour les écrans) et
  expose `fleet` + `selectVehicle` ; la notification pub/sub bascule toutes
  les instances montées — et les autres onglets via l'événement `storage`.
- **D39 précisé au point véhicule** : les items de la file figurent toujours
  leur `vehicleId` à la saisie ; un item sans véhicule se synchronise sur le
  choix du navigateur qui envoie, plus sur un « véhicule actif » disparu. Les
  chronologies de deux véhicules sont indépendantes — le trigger D6 est déjà
  par `vehicle_id` (rien à changer de ce côté).
- D26/D24 : le schéma zod `Vehicle` et les types générés perdent `is_active`
  (régénération après la migration).

## 16. Chronologie d'affichage des sorties (2026-11-28, session corrective)

### D45 — L'historique est trié par date de sortie, pas par date d'insertion

Bug produit remonté (2e fois) : dans l'historique, les sorties n'apparaissent
pas dans l'ordre des dates affichées. Cause : `fetchTrips` triait sur
`trips.created_at` — la date d'**insertion de la ligne**, pas la date de la
sortie. Une rétro-saisie (D31) ou un renvoi hors-ligne (D13/D39) crée donc une
ligne « récente » en base mais ancienne à l'écran : elle remontait en tête.

- **Règle** : la liste des sorties est triée par **date de départ du relevé**
  (`reading_at`, D14 — la date que la ligne affiche), la plus récente en
  premier ; `trips.created_at` ne sert que de repli (relevé introuvable) et de
  départage (départs à la même date). C'est le même critère que la
  chronologie des relevés (`listReadings` : `reading_at` puis `created_at`).
- Le tri vit **dans le hook** (`sortByTripDateDesc`, `useTrips.entries`) : la
  date de départ n'est connue qu'après la jonction par id (consigne M10, pas
  de jointure SQL), et le repository garde son ordre SQL comme défaut stable.
- **D42 précisée** : « les 2 dernières sorties » du dashboard se lit par la
  même clé — la récence affichée est la date de sortie, plus celle de
  l'insertion (la mention « récence `created_at`, repository » visait
  l'ordre de lecture, pas le critère de récence).
- Test : `sortByTripDateDesc` (3 cas purs) + régression hook « rétro-saisie
  reste à sa date ».
