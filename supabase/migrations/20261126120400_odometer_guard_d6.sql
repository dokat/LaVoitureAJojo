-- D6 (anti-recul) et D7 (immutabilité) contrôlés côté base : la base est la
-- vérité, le hook client côté app n'est que l'UX.

-- ── D7 : colonnes structurantes immuables ──────────────────────────────────
-- Erreur = suppression + ressaisie. Sont modifiables : photo_path (upload
-- après insert, chemin {user_id}/{reading_id}.jpg — D16), notes,
-- fuel_percent, deleted_*, restored_at.

create or replace function public.kilometers_immutable_columns()
returns trigger
language plpgsql
as $$
begin
  if new.km is distinct from old.km
     or new.reading_at is distinct from old.reading_at
     or new.vehicle_id is distinct from old.vehicle_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'KM_IMMUTABLE: un relevé existant ne se corrige pas par édition '
      '(km, reading_at, vehicle_id, user_id) — supprimer puis ressaisir (D7).';
  end if;
  return new;
end;
$$;

create trigger kilometers_immutable
  before update on public.kilometers
  for each row execute function public.kilometers_immutable_columns();

-- ── D6 : règle anti-recul du compteur ──────────────────────────────────────
-- Comparaison au relevé vivant le plus récent du véhicule (par reading_at).
-- km < km_dernier n'est accepté que si reading_at strictement antérieur
-- (rétro-saisie). Égalité de km acceptée ; même date et km inférieur refusée.
-- Le contrôle s'applique à l'insertion et à la RESTAURATION (update remettant
-- deleted_at à NULL) ; la suppression douce, elle, ne recontrôle rien : on
-- peut toujours retirer une ligne de la chronologie.

create or replace function public.enforce_odometer_no_regression()
returns trigger
language plpgsql
as $$
declare
  last_km integer;
  last_at timestamptz;
begin
  -- Update qui SOFT-DELETE cette ligne : hors périmètre D6 (retirer une ligne
  -- de la chronologie est toujours permis). TG_OP est en majuscules ; OLD
  -- n'existe pas sur INSERT → référence protégée par le if imbriqué.
  if tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null then
      return new;
    end if;
  end if;

  select k.km, k.reading_at
    into last_km, last_at
  from public.kilometers k
  where k.vehicle_id = new.vehicle_id
    and k.deleted_at is null
    and k.id is distinct from new.id
  order by k.reading_at desc, k.created_at desc
  limit 1;

  if last_km is not null
     and new.km < last_km
     and new.reading_at >= last_at
  then
    raise exception
      'KM_REGRESSION: km % < km % du dernier relevé (%). Une valeur '
      'inférieure n''est acceptée qu''avec une date strictement antérieure '
      'au dernier relevé (règle D6).',
      new.km, last_km, last_at;
  end if;
  return new;
end;
$$;

create trigger kilometers_no_regression
  before insert or update of km, reading_at, vehicle_id, deleted_at
  on public.kilometers
  for each row execute function public.enforce_odometer_no_regression();
