-- Test fumée RLS (milestone 2) : comportements membres/admin/anon sur
-- profiles, vehicles, kilometers, vérifiés en session SQL au rôle adéquat
-- (set role + request.jwt.claims, le pattern auth.uid() de PostgREST).
--
-- Usage : exécuter le fichier ENTIER d'un trait (SQL Editor ou MCP
-- execute_sql). Tout est rollbacké : aucune donnée ne persiste.
--
-- Pièges intégrés (comprendre avant de toucher aux expectations) :
--  * En RLS, un UPDATE dont la ligne ne passe pas USING ne LEVE rien : 0
--    ligne touchée, silencieusement. Seules les violations de WITH CHECK sur
--    INSERT (et WITH CHECK sur UPDATE d'une ligne visible) lèvent 42501.
--    Les interdictions « par absence d'effet » sont donc jugées sur l'ÉTAT
--    (R8b, R9b, R10b, R11b), pas sur une exception.
--  * anon ne peut pas écrire dans une table temp créée par un autre rôle :
--    les checks anon (R16) sont hors du script principal, dans un begin/
--    rollback à part.

begin;

-- ── Fixture (exécutée en postgres, hors RLS) ───────────────────────────────
insert into auth.users (id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000d701', 'authenticated', 'authenticated',
        'rls-membre@example.com', crypt('x', gen_salt('bf')),
        now(), now(), now());

-- véhicule de test ACTIF + véhicule de test inactif ; le réel est désactivé
-- le temps du test (rollback à la fin).
update public.vehicles set is_active = false where plate = 'AA876RE';
insert into public.vehicles (id, brand, model, plate, is_active) values
  ('00000000-0000-0000-0000-00000000d702', 'Test', 'RLS-Veh actif', 'RLS-A', true),
  ('00000000-0000-0000-0000-00000000d709', 'Test', 'RLS-Veh dev',   'RLS-D', false);

-- un relevé appartenant au compte admin réel du projet
insert into public.kilometers (id, vehicle_id, user_id, km, reading_at)
values ('00000000-0000-0000-0000-00000000d703',
        '00000000-0000-0000-0000-00000000d702',
        (select id from auth.users where email = 'jonathan.perrinet@gmail.com'),
        50000, '2026-11-01T12:00:00Z');

create temp table rls_results (label text, attendu text, obtenu text);
-- écrit par plusieurs rôles dans la même transaction → le leur donner
alter table rls_results owner to authenticated;

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
  execute 'insert into rls_results values ($1,$2,$3)' using p_label, p_attendu, v;
end;
$body$;

-- ── Côté MEMBRE (rôle authenticated, sub = utilisateur jetable) ────────────
-- NB : remplacer le sub par un uuid de profil 'membre' existant si le test
-- est adapté à un environnement donné ; ici la fixture le crée.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d701"}';

insert into rls_results select 'R1 membre voit 4 vehicules', '4',
  count(*)::int::text from public.vehicles;
insert into rls_results select 'R2 membre voit le releve', '1',
  count(*)::int::text from public.kilometers;
insert into rls_results select 'R3 is_admin faux (membre)', 'false',
  public.is_admin()::text;

-- INSERT autorisés / refusés (WITH CHECK → exception 42501)
select pg_temp.juge('R4 insert vehicule actif', 'ok',
  'insert into public.kilometers (vehicle_id, user_id, km, reading_at) values
   (''00000000-0000-0000-0000-00000000d702'', ''00000000-0000-0000-0000-00000000d701'',
    50100, ''2026-11-20T12:00:00Z'')');
select pg_temp.juge('R5 insert vehicule inactif leve', 'leve',
  'insert into public.kilometers (vehicle_id, user_id, km, reading_at) values
   (''00000000-0000-0000-0000-00000000d709'', ''00000000-0000-0000-0000-00000000d701'',
    50200, ''2026-11-21T12:00:00Z'')');
select pg_temp.juge('R6 insert au nom d autrui leve', 'leve',
  'insert into public.kilometers (vehicle_id, user_id, km, reading_at) values
   (''00000000-0000-0000-0000-00000000d702'',
    (select id from auth.users where email=''jonathan.perrinet@gmail.com''),
    50150, ''2026-11-22T12:00:00Z'')');

-- soft-delete de SON relevé : autorisé, effet attendu
select pg_temp.juge('R7 soft-delete de son releve', 'ok',
  'update public.kilometers set deleted_at = now(), deleted_by = auth.uid()
   where vehicle_id = ''00000000-0000-0000-0000-00000000d702''
     and user_id = ''00000000-0000-0000-0000-00000000d701''');

-- restauration par le membre : la ligne supprimée n'est visible par AUCUNE
-- policy USING du membre → UPDATE 0 ligne ; l'état doit rester supprimé
select pg_temp.juge('R8 update restauration membre', 'ok',
  'update public.kilometers set deleted_at = null, restored_at = now()
   where vehicle_id = ''00000000-0000-0000-0000-00000000d702''
     and user_id = ''00000000-0000-0000-0000-00000000d701''');
insert into rls_results select 'R8b membre toujours supprime', 'true',
  (deleted_at is not null)::text
from public.kilometers
where vehicle_id = '00000000-0000-0000-0000-00000000d702'
  and user_id = '00000000-0000-0000-0000-00000000d701';

-- édition du relevé d'autrui : 0 effet, l'état doit être intact
select pg_temp.juge('R9 update notes autrui (silencieux)', 'ok',
  'update public.kilometers set notes = ''piratage''
   where id = ''00000000-0000-0000-0000-00000000d703''');
insert into rls_results select 'R9b releve autrui intact', 'true',
  (notes is null)::text from public.kilometers
where id = '00000000-0000-0000-0000-00000000d703';

-- auto-promotion : aucune policy UPDATE sur profiles → 0 effet
select pg_temp.juge('R10 auto-promotion (silencieuse)', 'ok',
  'update public.profiles set role = ''admin''
   where id = ''00000000-0000-0000-0000-00000000d701''');
insert into rls_results select 'R10b role reste membre', 'membre', role
from public.profiles where id = '00000000-0000-0000-0000-00000000d701';

-- édition véhicule par membre : policy admin-only → 0 effet
select pg_temp.juge('R11 edit vehicule membre (silencieux)', 'ok',
  'update public.vehicles set brand = ''Hack''
   where id = ''00000000-0000-0000-0000-00000000d702''');
insert into rls_results select 'R11b brand intact', 'Test', brand
from public.vehicles where id = '00000000-0000-0000-0000-00000000d702';

-- ── Côté ADMIN (sub = compte admin réel du projet) ─────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c4b444ad-a7d9-4aa7-97d5-31aafb2772c4"}';
insert into rls_results select 'R12 is_admin vrai (admin)', 'true',
  public.is_admin()::text;

-- soft-delete du relevé d'autrui + restauration : autorisés
select pg_temp.juge('R13 admin soft-supprime autrui', 'ok',
  'update public.kilometers set deleted_at = now(), deleted_by = auth.uid()
   where id = ''00000000-0000-0000-0000-00000000d703''');
insert into rls_results select 'R13b supprime par admin', 'true',
  (deleted_at is not null
   and deleted_by = 'c4b444ad-a7d9-4aa7-97d5-31aafb2772c4')::text
from public.kilometers where id = '00000000-0000-0000-0000-00000000d703';
select pg_temp.juge('R14 admin restaure', 'ok',
  'update public.kilometers set deleted_at = null, restored_at = now()
   where id = ''00000000-0000-0000-0000-00000000d703''');
insert into rls_results select 'R14b restauree', 'true',
  (deleted_at is null)::text
from public.kilometers where id = '00000000-0000-0000-0000-00000000d703';

-- bascule véhicule (admin) : autorisé
select pg_temp.juge('R15 admin bascule vehicule', 'ok',
  'update public.vehicles set is_active = false
   where id = ''00000000-0000-0000-0000-00000000d702''');

-- ── Verdict ────────────────────────────────────────────────────────────────
reset role;
select count(*)::int                                   as tests,
       count(*) filter (where attendu <> obtenu)::int  as echecs,
       coalesce(jsonb_agg(jsonb_build_object('label', label, 'attendu', attendu,
               'obtenu', obtenu)) filter (where attendu <> obtenu),
                '[]'::jsonb)                           as echecs_detail
from rls_results;

rollback;

-- ── R16 (anon, hors transaction du script) ─────────────────────────────────
-- anon voit 0 ligne partout (aucune policy pour le rôle anon), sans erreur :
begin;
set local role anon;
select (select count(*)::int from public.kilometers) as km_rows,
       (select count(*)::int from public.profiles)   as profil_rows,
       (select count(*)::int from public.vehicles)   as veh_rows;
-- attendu : 0 / 0 / 0
reset role;
rollback;
