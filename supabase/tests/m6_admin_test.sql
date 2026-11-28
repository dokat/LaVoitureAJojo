-- Test documenté du périmètre admin du milestone 6, côté base : édition des
-- véhicules (D8 ; la bascule d'activation est morte avec D44), restauration
-- (D7 + recontrôle D6 à la restauration, D18), soft-delete d'autrui par
-- l'admin, synchronisation de profiles.email (D27).
--
-- Complète rls_smoke_test.sql (milestone 2) sans le répéter : les cas
-- « membre vs admin » génériques y sont déjà (R8b, R9b, R11b, R13, R14).
--
-- Usage : exécuter le fichier ENTIER d'un trait (SQL Editor ou MCP
-- execute_sql). Tout est posé dans une transaction puis ROLLBACKÉE.
-- Pièges : cf. en-tête de rls_smoke_test.sql (UPDATE hors USING = 0 ligne
-- silencieux ; jugement par l'État, pas par l'exception).

begin;

-- ── Fixture (postgres, hors RLS) ─────────────────────────────────────────────
-- Un compte membre jetable ; le trigger handle_new_user pose le profil, le
-- trigger sync_profile_email (D27) pose l'email — vérifié plus bas (E1).
insert into auth.users (id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000d801', 'authenticated', 'authenticated',
        'm6-membre@example.com', crypt('x', gen_salt('bf')),
        now(), now(), now());

-- Véhicules jetables de la flotte (D44 : plus d'état « actif » en base — tous
-- les véhicules de la flotte sont insérables par un membre).
insert into public.vehicles (id, brand, model, plate) values
  ('00000000-0000-0000-0000-00000000d802', 'Test', 'M6-flotte', 'M6-A'),
  ('00000000-0000-0000-0000-00000000d803', 'Test', 'M6-second', 'M6-B');

-- Chronologie du véhicule M6-A — posée dans l'ordre, chaque écriture passant
-- elle-même le contrôle D6 à l'insertion (preuve indirecte que le trigger
-- garde l'INSERT, pas seulement la restauration) :
--  d810 membre 48 000 @2026-12-20 (vivant ; anchor bas)
--  d813 membre 49 000 @2026-12-31 (≥ d810 → insérable ; sera supprimée)
--  d811 admin  50 200 @2026-12-31 (≥ d813 ; dernier vivant = point d'appui D6)
--  d812 membre 50 100 @2026-11-01 (rétro < 50 200 → insérable ; supprimée)
-- Résultat : d812 restaurable (date antérieure), d813 en CONFLIT à la
-- restauration (km < 50 200, même date que le dernier) → teste D18.
insert into public.kilometers (id, vehicle_id, user_id, km, reading_at) values
  ('00000000-0000-0000-0000-00000000d810',
   '00000000-0000-0000-0000-00000000d802',
   '00000000-0000-0000-0000-00000000d801', 48000, '2026-12-20T12:00:00Z'),
  ('00000000-0000-0000-0000-00000000d813',
   '00000000-0000-0000-0000-00000000d802',
   '00000000-0000-0000-0000-00000000d801', 49000, '2026-12-31T12:00:00Z'),
  ('00000000-0000-0000-0000-00000000d811',
   '00000000-0000-0000-0000-00000000d802',
   (select id from auth.users where email = 'jonathan.perrinet@gmail.com'),
   50200, '2026-12-31T12:00:00Z'),
  ('00000000-0000-0000-0000-00000000d812',
   '00000000-0000-0000-0000-00000000d802',
   '00000000-0000-0000-0000-00000000d801', 50100, '2026-11-01T12:00:00Z');

-- Suppressions douces de la fixture (le trigger ne bloque jamais un
-- soft-delete, D18) : d813 sera morte-en-conflit, d812 morte-rétro.
update public.kilometers
   set deleted_at = now(), deleted_by = '00000000-0000-0000-0000-00000000d801'
 where id in ('00000000-0000-0000-0000-00000000d812',
              '00000000-0000-0000-0000-00000000d813');

create temp table m6_results (label text, attendu text, obtenu text);
alter table m6_results owner to authenticated;

create function pg_temp.juge(p_label text, p_attendu text, p_sql text)
returns void language plpgsql as $body$
declare v text;
begin
  begin
    execute p_sql;
    v := case when p_attendu = 'leve' then 'ok-non-leve' else 'ok' end;
  exception when insufficient_privilege or raise_exception then
    v := case when p_attendu = 'leve' then 'leve' else 'leve-inattendu: '||sqlerrm end;
  end;
  execute 'insert into m6_results values ($1,$2,$3)' using p_label, p_attendu, v;
end;
$body$;

-- ── E1 : synchronisation profiles.email (D27) — exécutée en postgres ────────
insert into m6_results select 'E1 email synchronisé à la création',
  'm6-membre@example.com', email
  from public.profiles where id = '00000000-0000-0000-0000-00000000d801';

update auth.users set email = 'm6-renomme@example.com'
  where id = '00000000-0000-0000-0000-00000000d801';
insert into m6_results select 'E2 email propagé à la modification',
  'm6-renomme@example.com', email
  from public.profiles where id = '00000000-0000-0000-0000-00000000d801';

-- ── Côté MEMBRE (authenticated, sub = compte jetable) ───────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d801"}';

-- Le membre lit les emails : nécessaire aux libellés (filtre, historique).
insert into m6_results select 'E3 membre voit email profil admin', 'non-nul',
  case when email is not null then 'non-nul' else 'null' end
  from public.profiles
  where id = 'c4b444ad-a7d9-4aa7-97d5-31aafb2772c4';

-- Édition véhicule par le membre : policy admin-only → 0 ligne, silencieux.
select pg_temp.juge('V1 edit vehicule membre (silencieux)', 'ok',
  'update public.vehicles set brand = ''Hack'' where id = ''00000000-0000-0000-0000-00000000d802''');
insert into m6_results select 'V1b brand intact', 'Test', brand
  from public.vehicles where id = '00000000-0000-0000-0000-00000000d802';

-- D44 : écrire sur n'importe quel véhicule de la flotte est le droit commun
-- du membre — le choix du navigateur courant ne passe plus par l'admin.
select pg_temp.juge('V2 membre ecrit sur le second vehicule', 'ok',
  'insert into public.kilometers (vehicle_id, user_id, km, reading_at) values
   (''00000000-0000-0000-0000-00000000d803'', ''00000000-0000-0000-0000-00000000d801'',
    100, ''2026-12-01T12:00:00Z'')');
insert into m6_results select 'V2b releve pose sur d803', '1', count(*)::text
  from public.kilometers
  where vehicle_id = '00000000-0000-0000-0000-00000000d803';

-- Restauration par le membre de SA ligne morte : aucune policy USING ne la
-- voit côté membre → 0 ligne ; l'état doit rester supprimé (D7 : admin seul).
select pg_temp.juge('R1 restore membre (silencieuse)', 'ok',
  'update public.kilometers set deleted_at = null, restored_at = now()
   where id = ''00000000-0000-0000-0000-00000000d812''');
insert into m6_results select 'R1b ligne toujours morte', 'true',
  (deleted_at is not null)::text from public.kilometers
  where id = '00000000-0000-0000-0000-00000000d812';

-- Soft-delete de la ligne de l'ADMIN par le membre : 0 ligne, silencieux.
select pg_temp.juge('S1 soft-delete autrui par membre (silencieux)', 'ok',
  'update public.kilometers set deleted_at = now(), deleted_by = auth.uid()
   where id = ''00000000-0000-0000-0000-00000000d811''');
insert into m6_results select 'S1b releve admin intact', 'true',
  (deleted_at is null)::text from public.kilometers
  where id = '00000000-0000-0000-0000-00000000d811';

-- ── Côté ADMIN (authenticated, sub = compte admin réel du projet) ───────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c4b444ad-a7d9-4aa7-97d5-31aafb2772c4"}';

-- Édition infos véhicule : autorisée (D8).
select pg_temp.juge('V3 admin édite les infos', 'ok',
  'update public.vehicles set model = ''M6-rename'' where id = ''00000000-0000-0000-0000-00000000d803''');
insert into m6_results select 'V3b modèle à jour', 'M6-rename', model
  from public.vehicles where id = '00000000-0000-0000-0000-00000000d803';

-- Filet de la policy D44 : hors de la flotte, l'insertion est refusée même à
-- l'admin (WITH CHECK « véhicule existant » — la bascule d'activation et son
-- index d'unicité « deux actifs » n'existent plus).
select pg_temp.juge('V4 insert vehicule hors flotte leve', 'leve',
  'insert into public.kilometers (vehicle_id, user_id, km, reading_at) values
   (''00000000-0000-0000-0000-00000000d8ff'',
    ''c4b444ad-a7d9-4aa7-97d5-31aafb2772c4'', 100, ''2026-12-01T12:00:00Z'')');

-- Soft-delete de la ligne d'autrui (membre) : autorisé admin (D8).
select pg_temp.juge('S2 admin soft-supprime autrui', 'ok',
  'update public.kilometers set deleted_at = now(), deleted_by = auth.uid()
   where id = ''00000000-0000-0000-0000-00000000d810''');
insert into m6_results select 'S2b mort, tracé admin', 'true',
  (deleted_at is not null
   and deleted_by = 'c4b444ad-a7d9-4aa7-97d5-31aafb2772c4')::text
  from public.kilometers where id = '00000000-0000-0000-0000-00000000d810';

-- Restauration licite (d812 : rétro, km < dernier mais date antérieure).
select pg_temp.juge('R2 admin restaure une rétro-saisie', 'ok',
  'update public.kilometers set deleted_at = null, restored_at = now()
   where id = ''00000000-0000-0000-0000-00000000d812''');
insert into m6_results select 'R2b vivante + tracée', 'true',
  (deleted_at is null and restored_at is not null)::text
  from public.kilometers where id = '00000000-0000-0000-0000-00000000d812';

-- Restauration EN CONFLIT (d813 : km < dernier, même date) → D18 leve D6.
select pg_temp.juge('R3 restauration en conflit refusee (D18)', 'leve',
  'update public.kilometers set deleted_at = null, restored_at = now()
   where id = ''00000000-0000-0000-0000-00000000d813''');
insert into m6_results select 'R3b toujours morte', 'true',
  (deleted_at is not null and restored_at is null)::text
  from public.kilometers where id = '00000000-0000-0000-0000-00000000d813';

-- ── Verdict ──────────────────────────────────────────────────────────────────
reset role;
select count(*)::int                                  as tests,
       count(*) filter (where attendu <> obtenu)::int as echecs,
       coalesce(jsonb_agg(jsonb_build_object('label', label, 'attendu', attendu,
               'obtenu', obtenu)) filter (where attendu <> obtenu),
                '[]'::jsonb)                          as echecs_detail
from m6_results;

rollback;
