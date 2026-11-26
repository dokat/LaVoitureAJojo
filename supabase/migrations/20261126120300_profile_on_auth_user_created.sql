-- Tout utilisateur auth.users porte une ligne profiles, créée à l'inscription
-- (y compris OAuth Google — D15), avec le rôle par défaut 'membre'.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Trigger AFTER INSERT on auth.users. SECURITY DEFINER : doit écrire dans '
  'profiles hors contexte utilisateur. Le rôle ''admin'' n''est JAMAIS posé '
  'ici (promotion à la main, D8).';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
