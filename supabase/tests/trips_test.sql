-- Test documenté du modèle « sortie » (milestone 9, contrat D30→D37) :
-- ouverture, clôture D34 (km et date), clôture par admin / par non-auteur,
-- relais D35 (accepté, refusé km et date, inter-utilisateurs), annulation et
-- levée D36 (dont conflit D18 à la levée), sortie rétroactive D31,
-- suppression/restauration par agrégat D37, immuabilité D33, index de D35,
-- et répétition générale de la purge D40.
--
-- Usage : exécuter le fichier ENTIER d'un trait (SQL Editor ou MCP
-- execute_sql). Tout est posé dans une transaction puis ROLLBACKÉE.
-- Pièges : cf. en-tête de rls_smoke_test.sql (UPDATE hors USING = 0 ligne
-- silencieux ; jugement par l'État, pas par l'exception) et m6_admin_test.sql
-- (fixtures auth.users : colonnes complètes, jamais de NULL sur les champs
-- scannés par GoTrue).
--
-- Marqueurs d'erreur testés (reconnus par repositories/errors.ts au M10) :
-- TRIP_KM_ORDER, TRIP_DATE_ORDER, TRIP_RELAY_CONFLICT, TRIP_IMMUTABLE,
-- TRIP_ADMIN_ONLY (+ KM_REGRESSION du trigger D6 existant, réutilisé à la
-- levée d'annulation, D18/D36).

begin;

-- ── Fixtures (postgres, hors RLS) ────────────────────────────────────────────
-- Deux membres jetables ; l'admin est le compte réel du projet (c4b444ad…).
insert into auth.users (id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000d901', 'authenticated', 'authenticated',
        'm9-a@example.com', crypt('x', gen_salt('bf')), now(), now(), now()),
       ('00000000-0000-0000-0000-00000000d902', 'authenticated', 'authenticated',
        'm9-b@example.com', crypt('x', gen_salt('bf')), now(), now(), now());

-- Deux véhicules jetables de la flotte.
-- VA porte la chronologie principale ; VB une chronologie dédiée au scénario
-- annulation/levée (le conflit D18 exige une vivante à date >= du départ).
insert into public.vehicles (id, brand, model, plate) values
  ('00000000-0000-0000-0000-00000000d910', 'Test', 'M9-sorties',  'M9-A'),
  ('00000000-0000-0000-0000-00000000d911', 'Test', 'M9-annulation', 'M9-B');

-- Chronologie de VA — chaque insertage passe D6 à cet instant (preuve
-- indirecte du trigger existant). A = d901, B = d902.
--   rd_a  50000 12-01T10 A   départ trip_A
--   rd_z  49000 10-01T10 A   rétro basse — clôture en conflit km
--   rd_b  50100 11-15T10 B   rétro date — clôture en conflit date
--   rd_d  50300 12-03T10 B   relevé PARTAGÉ (arrivée trip_A = départ trip_B)
--   rd_e  50350 12-04T10 B   arrivée trip_B
--   rd_c  50050 11-01T10 A   rétro — relai en conflit km (vs départ rd_f)
--   rd_f  50400 12-05T10 A   départ trip_C
--   rd_k  50420 12-05T09 A   km ok, date avant rd_f — relai en conflit date
--   rd_g  50500 11-20T10 B   (libre — redondance date)
--   rd_m  50600 12-06T10 A   arrivée trip_C
--   rd_i1 50800 12-08T10 A   départ trip_D
--   rd_i2 50900 12-09T10 A   vivante de fin de chronologie
--   rd_j  50950 12-10T10 B   relevé PARTAGÉ du relais inter-utilisateurs
insert into public.kilometers (id, vehicle_id, user_id, km, reading_at) values
  ('00000000-0000-0000-0000-00000000da0a', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 50000, '2026-12-01T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da20', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 49000, '2026-10-01T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da0b', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d902', 50100, '2026-11-15T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da0d', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d902', 50300, '2026-12-03T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da0e', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d902', 50350, '2026-12-04T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da0c', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 50050, '2026-11-01T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da0f', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 50400, '2026-12-05T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da10', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 50420, '2026-12-05T09:00:00Z'),
  ('00000000-0000-0000-0000-00000000da11', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d902', 50500, '2026-11-20T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da12', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 50600, '2026-12-06T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da13', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 50800, '2026-12-08T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da14', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 50900, '2026-12-09T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da15', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d902', 50950, '2026-12-10T10:00:00Z');

-- Chronologie de VB (scénario annulation) — même date, km supérieur : la
-- levée d'annulation qui remet rd_q1 en chronologie DOIT heurter D6/D18.
insert into public.kilometers (id, vehicle_id, user_id, km, reading_at) values
  ('00000000-0000-0000-0000-00000000da21', '00000000-0000-0000-0000-00000000d911', '00000000-0000-0000-0000-00000000d901', 60000, '2026-12-05T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da22', '00000000-0000-0000-0000-00000000d911', '00000000-0000-0000-0000-00000000d901', 60100, '2026-12-05T10:00:00Z');

-- rd_n1/rd_n2 (sortie rétroactive trip_F, D31) sont insérés plus bas, au-dessus
-- de la chronologie vivante du moment.

create temp table m9_results (label text, attendu text, obtenu text);
alter table m9_results owner to authenticated;

-- p_attendu : 'ok' | 'leve' | 'leve:<MARQUEUR>' — le marqueur est le premier
-- token du message ('TRIP_KM_ORDER: …'), jugé pour de vrai (pas juste « une
-- exception »).
create function pg_temp.juge(p_label text, p_attendu text, p_sql text)
returns void language plpgsql as $body$
declare v text; m text;
begin
  begin
    execute p_sql;
    v := case when p_attendu like 'leve%' then 'ok-non-leve' else 'ok' end;
  exception
    when insufficient_privilege or raise_exception
         or check_violation or unique_violation then
    if p_attendu like 'leve:%' then
      m := (regexp_match(sqlerrm, '([A-Z][A-Z_]+):'))[1];
      v := 'leve:' || coalesce(m, sqlerrm);
    else
      v := 'leve';
    end if;
  end;
  execute 'insert into m9_results values ($1,$2,$3)' using p_label, p_attendu, v;
end;
$body$;

-- ══ VA — ouverture, clôtures D34, droits D33 ═════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d901"}';

select pg_temp.juge('O1 ouverture par l''auteur (A)', 'ok',
  'insert into public.trips (vehicle_id, start_reading_id) values
     (''00000000-0000-0000-0000-00000000d910'',
      ''00000000-0000-0000-0000-00000000da0a'')');

insert into m9_results select 'O1b une sortie ouverte', '1', count(*)::text
  from public.trips where vehicle_id = '00000000-0000-0000-0000-00000000d910'
    and end_reading_id is null and cancelled_at is null;

-- Clôture refusée km (D34) : rd_z 49000 < 50000.
select pg_temp.juge('C1 cloture refusree km (D34)', 'leve:TRIP_KM_ORDER',
  'update public.trips set end_reading_id =
     ''00000000-0000-0000-0000-00000000da20''
   where vehicle_id = ''00000000-0000-0000-0000-00000000d910''
     and end_reading_id is null');
insert into m9_results select 'C1b toujours ouverte', '1', count(*)::text
  from public.trips where vehicle_id = '00000000-0000-0000-0000-00000000d910'
    and end_reading_id is null and cancelled_at is null;

-- Clôture refusée date (D34) : rd_b 50100 ≥ 50000 mais 11-15 < 12-01.
select pg_temp.juge('C2 cloture refusree date (D34)', 'leve:TRIP_DATE_ORDER',
  'update public.trips set end_reading_id =
     ''00000000-0000-0000-0000-00000000da0b''
   where vehicle_id = ''00000000-0000-0000-0000-00000000d910''
     and end_reading_id is null');

-- Clôture par un membre non-auteur : 0 ligne silencieux (RLS), état intact.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d902"}';
select pg_temp.juge('C3 cloture par membre non-auteur (silencieuse)', 'ok',
  'update public.trips set end_reading_id =
     ''00000000-0000-0000-0000-00000000da0d''
   where vehicle_id = ''00000000-0000-0000-0000-00000000d910''
     and end_reading_id is null');
insert into m9_results select 'C3b trip_A intacte ouverte', '1', count(*)::text
  from public.trips where vehicle_id = '00000000-0000-0000-0000-00000000d910'
    and end_reading_id is null and cancelled_at is null;

-- Clôture par l'ADMIN d'une sortie d'autrui : autorisée (D33).
set local role authenticated;
set local request.jwt.claims = '{"sub":"c4b444ad-a7d9-4aa7-97d5-31aafb2772c4"}';
select pg_temp.juge('C4 cloture par l''admin', 'ok',
  'update public.trips set end_reading_id =
     ''00000000-0000-0000-0000-00000000da0d''
   where vehicle_id = ''00000000-0000-0000-0000-00000000d910''
     and end_reading_id is null');
insert into m9_results select 'C4b trip_A cloturee sur rd_d', 'true',
  (end_reading_id = '00000000-0000-0000-0000-00000000da0d')::text
  from public.trips where start_reading_id = '00000000-0000-0000-0000-00000000da0a';

-- ══ Relais D35 ═══════════════════════════════════════════════════════════════
-- B ouvre sur rd_d : le MÊME relevé sert de départ (arrivée de trip_A posée
-- en C4) — partage légal par les UNIQUE de colonne (D30), somme des distances
-- = distance réelle.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d902"}';
select pg_temp.juge('R1 relais partageant le meme releve', 'ok',
  'insert into public.trips (vehicle_id, start_reading_id) values
     (''00000000-0000-0000-0000-00000000d910'',
      ''00000000-0000-0000-0000-00000000da0d'')');
insert into m9_results select 'R1b releve double-emploi ok', 'true',
  ((select end_reading_id from public.trips
     where start_reading_id = '00000000-0000-0000-0000-00000000da0a')
   = (select start_reading_id from public.trips
     where vehicle_id = '00000000-0000-0000-0000-00000000d910'
       and end_reading_id is null))::text;

-- B clôture trip_B sur rd_e ; somme des distances close = e − a = 350.
select pg_temp.juge('R2 cloture trip_B par son auteur', 'ok',
  'update public.trips set end_reading_id =
     ''00000000-0000-0000-0000-00000000da0e''
   where start_reading_id = ''00000000-0000-0000-0000-00000000da0d''');
insert into m9_results select 'R2b somme des distances = 350', '350',
  (select sum(ke.km - ks.km)::text
     from public.trips t
     join public.kilometers ks on ks.id = t.start_reading_id
     join public.kilometers ke on ke.id = t.end_reading_id
    where t.vehicle_id = '00000000-0000-0000-0000-00000000d910')::text;

-- A ouvre trip_C (rd_f) ; B tente deux relais illégaux — refus typés, JAMAIS
-- de cap implicite, trip_C reste ouverte (jugé par l'état).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d901"}';
select pg_temp.juge('R3 ouverture trip_C', 'ok',
  'insert into public.trips (vehicle_id, start_reading_id) values
     (''00000000-0000-0000-0000-00000000d910'',
      ''00000000-0000-0000-0000-00000000da0f'')');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d902"}';
select pg_temp.juge('R4 relai refuse km (D35)', 'leve:TRIP_RELAY_CONFLICT',
  'insert into public.trips (vehicle_id, start_reading_id) values
     (''00000000-0000-0000-0000-00000000d910'',
      ''00000000-0000-0000-0000-00000000da0c'')');
select pg_temp.juge('R5 relai refuse date (D35)', 'leve:TRIP_RELAY_CONFLICT',
  'insert into public.trips (vehicle_id, start_reading_id) values
     (''00000000-0000-0000-0000-00000000d910'',
      ''00000000-0000-0000-0000-00000000da10'')');
insert into m9_results select 'R5b trip_C intacte ouverte', 'true',
  (end_reading_id is null)::text from public.trips
  where start_reading_id = '00000000-0000-0000-0000-00000000da0f';
insert into m9_results select 'R5c aucune sortie sur rd_c/rd_k', '0', count(*)::text
  from public.trips
  where start_reading_id in ('00000000-0000-0000-0000-00000000da0c',
                             '00000000-0000-0000-0000-00000000da10')
     or end_reading_id in ('00000000-0000-0000-0000-00000000da0c',
                           '00000000-0000-0000-0000-00000000da10');

-- A clôture trip_C (rd_m) puis ouvre trip_D (rd_i1).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d901"}';
select pg_temp.juge('R6 cloture trip_C (A)', 'ok',
  'update public.trips set end_reading_id =
     ''00000000-0000-0000-0000-00000000da12''
   where start_reading_id = ''00000000-0000-0000-0000-00000000da0f''');
select pg_temp.juge('R7 ouverture trip_D (A)', 'ok',
  'insert into public.trips (vehicle_id, start_reading_id) values
     (''00000000-0000-0000-0000-00000000d910'',
      ''00000000-0000-0000-0000-00000000da13'')');

-- X1 : relais INTER-UTILISATEURS — B ouvre sur rd_j et clôt ainsi la sortie de
-- A. Seul le trigger SECURITY DEFINER peut écrire la ligne d'autrui (D35).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d902"}';
select pg_temp.juge('X1 relais inter-utilisateurs (B clot A)', 'ok',
  'insert into public.trips (vehicle_id, start_reading_id) values
     (''00000000-0000-0000-0000-00000000d910'',
      ''00000000-0000-0000-0000-00000000da15'')');
insert into m9_results select 'X1b trip_D cloturee par relayeur', 'true',
  (end_reading_id = '00000000-0000-0000-0000-00000000da15')::text
  from public.trips where start_reading_id = '00000000-0000-0000-0000-00000000da13';

-- X2 : B annule SA sortie en relais → rd_j meurt en miroir (D36) ; trip_D
-- reste clôturée SUR un relevé mort — contagion par les relevés (D33), la
-- ligne trips ne bouge pas.
select pg_temp.juge('X2 annulation par le relayeur', 'ok',
  'update public.trips set cancelled_at = now()
   where start_reading_id = ''00000000-0000-0000-0000-00000000da15''');
insert into m9_results select 'X2b rd_j soft-delte en miroir', 'true',
  (deleted_at is not null
   and deleted_by = '00000000-0000-0000-0000-00000000d902')::text
  from public.kilometers where id = '00000000-0000-0000-0000-00000000da15';
insert into m9_results select 'X2c trip_D fermee intacte', 'true',
  (end_reading_id = '00000000-0000-0000-0000-00000000da15'
   and cancelled_at is null)::text
  from public.trips where start_reading_id = '00000000-0000-0000-0000-00000000da13';

-- ══ VB — annulation et levée (D36/D37) ═══════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d901"}';
select pg_temp.juge('K1 ouverture trip_Q (VB)', 'ok',
  'insert into public.trips (vehicle_id, start_reading_id) values
     (''00000000-0000-0000-0000-00000000d911'',
      ''00000000-0000-0000-0000-00000000da21'')');

select pg_temp.juge('K2 annulation par l''auteur', 'ok',
  'update public.trips set cancelled_at = now()
   where start_reading_id = ''00000000-0000-0000-0000-00000000da21''');
insert into m9_results select 'K2b depart soft-delte (miroir D36)', 'true',
  (deleted_at is not null
   and deleted_by = '00000000-0000-0000-0000-00000000d901')::text
  from public.kilometers where id = '00000000-0000-0000-0000-00000000da21';
insert into m9_results select 'K2c VB sans sortie ouverte', '0', count(*)::text
  from public.trips where vehicle_id = '00000000-0000-0000-0000-00000000d911'
    and end_reading_id is null and cancelled_at is null;
-- Le départ annulé est invisible de la chronologie (cas d'usage D36) : le
-- dernier vivant de VB est rd_q2, plus rd_q1.
insert into m9_results select 'K2d depart hors chronologie', '60100',
  (select km::text from public.kilometers
    where vehicle_id = '00000000-0000-0000-0000-00000000d911'
      and deleted_at is null
    order by reading_at desc limit 1);

-- Levée par un membre, fût-il l'auteur : refusée (D36/D37 — admin seul).
select pg_temp.juge('K3 levee par membre refusee', 'leve:TRIP_ADMIN_ONLY',
  'update public.trips set cancelled_at = null
   where start_reading_id = ''00000000-0000-0000-0000-00000000da21''');

-- Levée par l'admin ALORS que rd_q2 (60100, même date) tient la chronologie :
-- le trigger D6/D18 fait échouer la restauration du départ (60000 < 60100 à
-- date >=) → refus, la sortie reste annulée, le départ reste mort (D36).
set local role authenticated;
set local request.jwt.claims = '{"sub":"c4b444ad-a7d9-4aa7-97d5-31aafb2772c4"}';
select pg_temp.juge('K4 levee en conflit D6 refusee (D18)', 'leve:KM_REGRESSION',
  'update public.trips set cancelled_at = null
   where start_reading_id = ''00000000-0000-0000-0000-00000000da21''');
insert into m9_results select 'K4b toujours annulee, depart toujours mort', 'true',
  ((select cancelled_at is not null from public.trips
     where start_reading_id = '00000000-0000-0000-0000-00000000da21')
   and (select deleted_at is not null from public.kilometers
     where id = '00000000-0000-0000-0000-00000000da21'))::text;

-- rd_q2 retirée de la chronologie (fixture postgres) : la levée propre passe —
-- cancelled_at NULL + départ revivant (D37, sous recontrôle D18).
reset role;
update public.kilometers set deleted_at = now(),
       deleted_by = '00000000-0000-0000-0000-00000000d901'
 where id = '00000000-0000-0000-0000-00000000da22';
set local role authenticated;
set local request.jwt.claims = '{"sub":"c4b444ad-a7d9-4aa7-97d5-31aafb2772c4"}';
select pg_temp.juge('K5 levee propre par admin (D37)', 'ok',
  'update public.trips set cancelled_at = null
   where start_reading_id = ''00000000-0000-0000-0000-00000000da21''');
insert into m9_results select 'K5b depart revivant + sortie rouverte', 'true',
  ((select deleted_at is null and restored_at is not null
      from public.kilometers where id = '00000000-0000-0000-0000-00000000da21')
   and (select cancelled_at is null and end_reading_id is null
      from public.trips
     where start_reading_id = '00000000-0000-0000-0000-00000000da21'))::text;

-- ══ Immuabilité et invariants (D33) ══════════════════════════════════════════
-- Réouvrir une sortie clôturée (A auteur de trip_D) : refusé.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d901"}';
select pg_temp.juge('I1 reouverture d''une cloturee refusee', 'leve:TRIP_IMMUTABLE',
  'update public.trips set end_reading_id = null
   where start_reading_id = ''00000000-0000-0000-0000-00000000da13''');

-- Annuler une sortie clôturée : le CHECK la refuse (23514).
select pg_temp.juge('I2 annulation d''une cloturee refusee', 'leve',
  'update public.trips set cancelled_at = now()
   where start_reading_id = ''00000000-0000-0000-0000-00000000da13''');
insert into m9_results select 'I2b trip_D intacte cloturee', 'true',
  (cancelled_at is null and end_reading_id is not null)::text
  from public.trips where start_reading_id = '00000000-0000-0000-0000-00000000da13';

-- ══ Sortie rétroactive (D31) + agrégat (D33/D37) ═════════════════════════════
-- Née clôturée : départ ET arrivée à l'INSERTION, D34 vérifié (rd_n2 > rd_n1).
reset role;
insert into public.kilometers (id, vehicle_id, user_id, km, reading_at) values
  ('00000000-0000-0000-0000-00000000da16', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 51000, '2026-12-11T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000da17', '00000000-0000-0000-0000-00000000d910', '00000000-0000-0000-0000-00000000d901', 51100, '2026-12-12T10:00:00Z');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d901"}';
select pg_temp.juge('F1 sortie retroagitee nee closee (D31)', 'ok',
  'insert into public.trips (vehicle_id, start_reading_id, end_reading_id)
   values (''00000000-0000-0000-0000-00000000d910'',
           ''00000000-0000-0000-0000-00000000da16'',
           ''00000000-0000-0000-0000-00000000da17'')');
insert into m9_results select 'F1b nee sans relai (VB seule reste ouverte)', 'true',
  (count(*) = 0)::text from public.trips
  where vehicle_id = '00000000-0000-0000-0000-00000000d910'
    and end_reading_id is null and cancelled_at is null;

-- Suppression de la sortie = soft-delete des DEUX relevés par l'auteur (D33),
-- en deux écritures sur kilometers — la ligne trips ne bouge jamais.
select pg_temp.juge('F2 suppression par l''auteur (2 releves)', 'ok',
  'update public.kilometers set deleted_at = now(), deleted_by = auth.uid()
   where id in (''00000000-0000-0000-0000-00000000da16'',
                ''00000000-0000-0000-0000-00000000da17'')');
insert into m9_results select 'F2b deux releves morts', '2', count(*)::text
  from public.kilometers
  where id in ('00000000-0000-0000-0000-00000000da16',
               '00000000-0000-0000-0000-00000000da17')
    and deleted_at is not null;
insert into m9_results select 'F2c ligne trips intacte', 'true',
  (end_reading_id = '00000000-0000-0000-0000-00000000da17'
   and cancelled_at is null)::text
  from public.trips where start_reading_id = '00000000-0000-0000-0000-00000000da16';

-- Restauration par agrégat (D37) : admin, les deux relevés, chacun recontrôlé
-- D18 — réintégrables tels quels (chronologie intacte par ailleurs).
set local role authenticated;
set local request.jwt.claims = '{"sub":"c4b444ad-a7d9-4aa7-97d5-31aafb2772c4"}';
select pg_temp.juge('F3 restauration agregat par admin (D37)', 'ok',
  'update public.kilometers set deleted_at = null, restored_at = now()
   where id in (''00000000-0000-0000-0000-00000000da16'',
                ''00000000-0000-0000-0000-00000000da17'')');
insert into m9_results select 'F3b sortie revenue vivante', '2', count(*)::text
  from public.kilometers
  where id in ('00000000-0000-0000-0000-00000000da16',
               '00000000-0000-0000-0000-00000000da17')
    and deleted_at is null;

-- Un membre ne soft-supprime pas la sortie d'autrui par contagion : les
-- relevés d'A sont hors de sa portée (0 ligne silencieux, policy auteur).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000d902"}';
select pg_temp.juge('F4 suppression autrui par membre (silencieuse)', 'ok',
  'update public.kilometers set deleted_at = now(), deleted_by = auth.uid()
   where id = ''00000000-0000-0000-0000-00000000da14''');
insert into m9_results select 'F4b rd_i2 intacte vivante', 'true',
  (deleted_at is null)::text from public.kilometers
  where id = '00000000-0000-0000-0000-00000000da14';

-- ══ Index (D30/D35) ══════════════════════════════════════════════════════════
reset role;
insert into m9_results select 'IX1 index une sortie ouverte present', 'true',
  exists (select 1 from pg_indexes
           where tablename = 'trips'
             and indexname = 'trips_one_open_per_vehicle')::text;
insert into m9_results select 'IX2 UNIQUE depart present', 'true',
  exists (select 1 from pg_constraint
           where conrelid = 'public.trips'::regclass
             and conname = 'trips_start_reading_id_key')::text;
insert into m9_results select 'IX3 UNIQUE arrivee present', 'true',
  exists (select 1 from pg_constraint
           where conrelid = 'public.trips'::regclass
             and conname = 'trips_end_reading_id_key')::text;

-- Un même relevé ne peut servir DEUX FOIS de départ (23505 sur l'UNIQUE) — le
-- double-emploi légal du relais (arrivée de l'un, départ de l'autre) est
-- couvert par R1 et X1/X2.
select pg_temp.juge('IX4 double usage en depart refuse', 'leve',
  'insert into public.trips (vehicle_id, start_reading_id) values
     (''00000000-0000-0000-0000-00000000d910'',
      ''00000000-0000-0000-0000-00000000da0d'')');

-- ══ Répétition générale de la purge D40 (dans ce rollback) ═══════════════════
-- Sens interdit de la purge : sorties d'abord, relevés ensuite (FK).
delete from public.trips;
insert into m9_results select 'P1 trips videe', '0',
  (select count(*)::text from public.trips);
delete from public.kilometers;
insert into m9_results select 'P2 kilometers DELETE physique possible', '0',
  (select count(*)::text from public.kilometers);

-- ── Verdict ──────────────────────────────────────────────────────────────────
reset role;
select count(*)::int                                  as tests,
       count(*) filter (where attendu <> obtenu)::int as echecs,
       coalesce(jsonb_agg(jsonb_build_object('label', label, 'attendu', attendu,
               'obtenu', obtenu)) filter (where attendu <> obtenu),
                '[]'::jsonb)                          as echecs_detail
from m9_results;

rollback;
