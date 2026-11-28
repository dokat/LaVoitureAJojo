-- Test documenté de la règle anti-recul D6 (+ immutabilité D7) côté SQL.
-- pgTAP n'est pas activé sur le projet gratuit ; ce script est la variante
-- « SQL manuel documenté » prévue par le plan (milestone 2).
--
-- Usage : exécuter le fichier ENTIER d'un trait (SQL Editor ou MCP
-- execute_sql). Tout est posé dans une transaction puis ROLLBACKÉE : aucune
-- donnée ne persiste, aucun impact sur l'historique réel.
--
-- Verdict : 1 ligne retournée — nb_tests, echecs (0 = tout passe), résumé.

begin;

-- ── Fixture : compte, profil (via trigger), deux véhicules jetables ────────
insert into auth.users (id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000d601', 'authenticated', 'authenticated',
        'd6-test@example.com', crypt('mot-de-passe-inutile', gen_salt('bf')),
        now(), now(), now());

insert into public.vehicles (id, brand, model, plate) values
  ('00000000-0000-0000-0000-00000000d602', 'Test', 'V1', 'D6-V1'),
  ('00000000-0000-0000-0000-00000000d603', 'Test', 'V2', 'D6-V2');

create temp table d6_results (
  scenario text, attendu text, obtenu text, detail text
);

-- execute la requête passée en texte ; note le résultat dans d6_results.
create function pg_temp.attempt(p_scenario text, p_attendu text, p_body text)
returns void
language plpgsql
as $body$
begin
  execute p_body;
  insert into d6_results values (p_scenario, p_attendu, 'ok', null);
exception when raise_exception then
  if p_attendu = 'refuse'
     and (sqlerrm like '%KM_REGRESSION%' or sqlerrm like '%KM_IMMUTABLE%')
  then
    insert into d6_results values (p_scenario, 'refuse', 'refuse', sqlerrm);
  elsif p_attendu = 'ok' then
    insert into d6_results values (p_scenario, 'ok', 'leve', sqlerrm);
  else
    insert into d6_results values (p_scenario, p_attendu, 'autre-erreur', sqlerrm);
  end if;
end;
$body$;

do $$
declare
  u   constant uuid := '00000000-0000-0000-0000-00000000d601';
  v1  constant uuid := '00000000-0000-0000-0000-00000000d602';
  v2  constant uuid := '00000000-0000-0000-0000-00000000d603';
  d1  constant timestamptz := '2026-01-01T12:00:00Z';
  d15 constant timestamptz := '2026-01-15T12:00:00Z';
  d2  constant timestamptz := '2026-02-01T12:00:00Z';
  d3  constant timestamptz := '2026-03-01T12:00:00Z';
  d4  constant timestamptz := '2026-04-01T12:00:00Z';
  d5  constant timestamptz := '2026-05-01T12:00:00Z';
begin
  -- Véhicule V1 — chronologie de base
  perform pg_temp.attempt('S1 premiere saisie acceptee', 'ok',
    format('insert into public.kilometers (vehicle_id, user_id, km, reading_at) values (%L, %L, 1000, %L)', v1, u, d1));
  perform pg_temp.attempt('S2 progression normale', 'ok',
    format('insert into public.kilometers (vehicle_id, user_id, km, reading_at) values (%L, %L, 1100, %L)', v1, u, d2));
  perform pg_temp.attempt('S3 retro-saisie oubliee (date anterieure, km inferieur)', 'ok',
    format('insert into public.kilometers (vehicle_id, user_id, km, reading_at) values (%L, %L, 1050, %L)', v1, u, d15));
  perform pg_temp.attempt('S4 remise a l''heure vers le bas refusee', 'refuse',
    format('insert into public.kilometers (vehicle_id, user_id, km, reading_at) values (%L, %L, 1090, %L)', v1, u, d3));
  perform pg_temp.attempt('S5 meme date que le dernier et km inferieur refusee', 'refuse',
    format('insert into public.kilometers (vehicle_id, user_id, km, reading_at) values (%L, %L, 1050, %L)', v1, u, d2));
  perform pg_temp.attempt('S6 egalite de km acceptee', 'ok',
    format('insert into public.kilometers (vehicle_id, user_id, km, reading_at) values (%L, %L, 1100, %L)', v1, u, d3));
  perform pg_temp.attempt('S7 meme date et km superieur accepte', 'ok',
    format('insert into public.kilometers (vehicle_id, user_id, km, reading_at) values (%L, %L, 1200, %L)', v1, u, d3));

  -- Véhicule V2 — soft-delete / restauration et re-contrôle D6
  perform pg_temp.attempt('S8 premier releve (V2)', 'ok',
    format('insert into public.kilometers (vehicle_id, user_id, km, reading_at) values (%L, %L, 1000, %L)', v2, u, d5));
  perform pg_temp.attempt('S9 insertion datee plus ancienne mais km superieur', 'ok',
    format('insert into public.kilometers (vehicle_id, user_id, km, reading_at) values (%L, %L, 1200, %L)', v2, u, d4));
  perform pg_temp.attempt('S10 soft-delete du plus recent', 'ok',
    format('update public.kilometers set deleted_at = now(), deleted_by = %L where vehicle_id = %L and km = 1000', u, v2));
  perform pg_temp.attempt('S11 restauration en conflit avec le dernier vivant refusee', 'refuse',
    'update public.kilometers set deleted_at = null, restored_at = now() where vehicle_id = ''00000000-0000-0000-0000-00000000d603'' and km = 1000');

  -- D7 — immutabilité
  perform pg_temp.attempt('S12 edition directe du km refusee (D7)', 'refuse',
    format('update public.kilometers set km = 999999 where vehicle_id = %L and km = 1200', v2));
end;
$$;

-- ── Verdict ────────────────────────────────────────────────────────────────
select
  count(*)::int                                          as nb_tests,
  count(*) filter (where attendu <> obtenu)::int         as echecs,
  jsonb_agg(jsonb_build_object(
    'scenario', scenario, 'attendu', attendu, 'obtenu', obtenu,
    'ok', attendu = obtenu) order by scenario)           as resume
from d6_results;

rollback;
