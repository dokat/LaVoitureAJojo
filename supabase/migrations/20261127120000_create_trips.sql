-- Modèle « sortie » (D30→D36) : `trips` n'est qu'une couche de liaison entre
-- deux relevés existants de `kilometers`. Le kilométrage, le graphique, la
-- règle D6 et le soft-delete D7 restent natifs des relevés — rien n'est dupliqué.

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id),
  start_reading_id uuid not null references public.kilometers (id),
  end_reading_id uuid references public.kilometers (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  -- D30 : chaque relevé au plus une fois comme départ, au plus une fois comme
  -- arrivée — c'est ce qui rend légal le partage du relais (D35) et rend
  -- impossible le double-usage d'un relevé.
  constraint trips_start_reading_id_key unique (start_reading_id),
  constraint trips_end_reading_id_key unique (end_reading_id),
  -- D36/D33 : une sortie annulée n'est pas clôturée (et réciproquement).
  constraint trips_not_closed_when_cancelled
    check (cancelled_at is null or end_reading_id is null)
);

comment on column public.trips.end_reading_id is
  'NULL = sortie en cours (D30). Une fois posée, immuable (D33) : '
  'rouvrir = créer une nouvelle sortie.';
comment on column public.trips.cancelled_at is
  'Annulation (D36) : miroir du soft-delete du relevé de départ, entretenu '
  'par trigger — jamais l''un sans l''autre.';

-- D35 : une sortie ouverte à la fois par véhicule. L'ouverture concurrente qui
-- passerait malgré le trigger de relais (course) est refusée ici (23505, nom
-- d'index connu du client M10).
create unique index trips_one_open_per_vehicle
  on public.trips (vehicle_id)
  where end_reading_id is null and cancelled_at is null;

-- fetchTrips(vehicleId) (M10) ; l'index partiel ne couvre que les ouvertes.
create index trips_vehicle
  on public.trips (vehicle_id);

-- ── D34 : règle chronologique interne à la sortie ───────────────────────────
-- À la clôture (posée ou née posée) : km(arrivée) ≥ km(départ) ET
-- date(arrivée) ≥ date(départ), égalités acceptées. p_relay ajuste le marqueur
-- d'erreur : le relais (D35) refuse avec TRIP_RELAY_CONFLICT, la clôture
-- directe avec TRIP_KM_ORDER / TRIP_DATE_ORDER (reconnus par errors.ts au M10).

create or replace function public.trip_assert_order(
  p_start uuid, p_end uuid, p_relay boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  s_km integer;
  s_at timestamptz;
  e_km integer;
  e_at timestamptz;
begin
  select k.km, k.reading_at into s_km, s_at
    from public.kilometers k where k.id = p_start;
  select k.km, k.reading_at into e_km, e_at
    from public.kilometers k where k.id = p_end;

  if e_km < s_km then
    if p_relay then
      raise exception
        'TRIP_RELAY_CONFLICT: le relais échoue — km % < km de départ de la '
        'sortie en cours (%). Vérifiez le compteur ou demandez à l''admin (D35).',
        e_km, s_km;
    else
      raise exception
        'TRIP_KM_ORDER: km arrivée % < km départ % — une sortie ne peut pas '
        'finir plus bas qu''elle n''a commencé (D34).',
        e_km, s_km;
    end if;
  end if;

  if e_at < s_at then
    if p_relay then
      raise exception
        'TRIP_RELAY_CONFLICT: le relais échoue — date d''arrivée % antérieure '
        'au départ de la sortie en cours (%). Vérifiez les dates ou demandez '
        'à l''admin (D35).',
        e_at, s_at;
    else
      raise exception
        'TRIP_DATE_ORDER: date arrivée % < date départ % — cohérence '
        'chronologique d''une sortie (D34).',
        e_at, s_at;
    end if;
  end if;
end;
$$;

-- ── Insertion : relais (D35) + clôture native (D31 rétroactif) ───────────────
-- SECURITY DEFINER : le relais met à jour la sortie ouverte d'AUTRUI, écriture
-- qu'aucune policy n'autoriserait sous le rôle appelant (l'UI demande la
-- confirmation avant d'appeler — D35).

create or replace function public.trips_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_id uuid;
  v_open_start uuid;
begin
  -- Une ouverture pendant qu'une sortie est oubliée ouverte = relais : le
  -- relevé de départ du nouveau venu clôt l'ancienne sortie (le MÊME relevé
  -- sert d'arrivée et de départ, D30/D35). Verrou pour la course concurrente.
  select t.id, t.start_reading_id
    into v_open_id, v_open_start
    from public.trips t
   where t.vehicle_id = new.vehicle_id
     and t.end_reading_id is null
     and t.cancelled_at is null
     for update;

  if found then
    perform public.trip_assert_order(v_open_start, new.start_reading_id, true);
    update public.trips
       set end_reading_id = new.start_reading_id
     where id = v_open_id;
  end if;

  -- Sortie née clôturée (rétro-saisie D31) : D34 s'applique à l'insertion.
  if new.end_reading_id is not null then
    perform public.trip_assert_order(
      new.start_reading_id, new.end_reading_id, false);
  end if;

  return new;
end;
$$;

-- ── Update : clôture (D34), annulation/levée (D36), droits (D33/D37) ─────────
-- SECURITY INVOKER : le droit d'atteindre la ligne est déjà borné par la
-- policy trips (auteur du départ ou admin) ; les écritures induites dans
-- kilometers passent, elles, sous les policies kilometers existantes.

create or replace function public.trips_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Immuabilité structurelle (D33) : seuls end_reading_id et cancelled_at
  -- bougent jamais.
  if new.id is distinct from old.id
     or new.vehicle_id is distinct from old.vehicle_id
     or new.start_reading_id is distinct from old.start_reading_id
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'TRIP_IMMUTABLE: id, véhicule, départ et created_at d''une sortie ne se '
      'modifient pas (D33) — annuler + redémarrer, ou supprimer + ressaisir.';
  end if;

  if old.end_reading_id is not null
     and new.end_reading_id is distinct from old.end_reading_id
  then
    raise exception
      'TRIP_IMMUTABLE: une sortie clôturée ne se réouvre pas (D33) — ouvrir '
      'une nouvelle sortie.';
  end if;

  if new.cancelled_at is null and old.cancelled_at is not null then
    -- Levée d'annulation : admin seulement (D36/D37), et le recontrôle D6/D18
    -- du trigger kilometers garde la remise en chronologie.
    if not (select public.is_admin()) then
      raise exception
        'TRIP_ADMIN_ONLY: la levée d''annulation est réservée à l''admin (D36).';
    end if;
    update public.kilometers
       set deleted_at = null, restored_at = now()
     where id = new.start_reading_id
       and deleted_at is not null;
  elsif new.cancelled_at is not null and old.cancelled_at is null then
    -- Annulation = soft-delete du relevé de départ dans la foulée (D36) :
    -- sinon un faux départ pollue la chronologie et bloque le véhicule via D6.
    -- Idempotence (D39) : si le départ est déjà mort, rien à faire.
    update public.kilometers
       set deleted_at = now(), deleted_by = (select auth.uid())
     where id = new.start_reading_id
       and deleted_at is null;
  end if;

  if new.end_reading_id is distinct from old.end_reading_id then
    perform public.trip_assert_order(
      new.start_reading_id, new.end_reading_id, false);
  end if;

  return new;
end;
$$;

create trigger trips_before_insert
  before insert on public.trips
  for each row execute function public.trips_before_insert();

create trigger trips_before_update
  before update of end_reading_id, cancelled_at, vehicle_id,
                 start_reading_id, created_at
  on public.trips
  for each row execute function public.trips_before_update();

-- Durcissement (patron M2/D28-security) : fonctions de trigger non appelables
-- par RPC ; le definer ne s'exécute que via le trigger.
revoke execute on function public.trip_assert_order(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.trips_before_insert()
  from public, anon, authenticated;
revoke execute on function public.trips_before_update()
  from public, anon, authenticated;

-- ── RLS (D33) ────────────────────────────────────────────────────────────────
-- Pas de policy DELETE : supprimer une sortie clôturée passe par le
-- soft-delete de ses deux relevés (policies kilometers existantes, D33/D37 —
-- contagion, jamais d'écriture directe sur trips).

alter table public.trips enable row level security;

create policy "sorties visibles par tout authentifie"
  on public.trips for select
  to authenticated
  using (true);

create policy "ouverture de sortie par tout authentifie"
  on public.trips for insert
  to authenticated
  with check (true);

-- « Auteur de la sortie » = auteur du relevé de départ (le véhicule et le
-- départ sont la signature de celui qui ouvre). Le relais d'AUTRUI est écrit
-- par le trigger definer, hors de cette policy (D35).
create policy "cloture ou annulation par l_auteur du depart ou admin"
  on public.trips for update
  to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.kilometers k
      where k.id = trips.start_reading_id
        and k.user_id = (select auth.uid())
    )
  )
  with check (
    (select public.is_admin())
    or exists (
      select 1 from public.kilometers k
      where k.id = trips.start_reading_id
        and k.user_id = (select auth.uid())
    )
  );
