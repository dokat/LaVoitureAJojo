-- profiles : un row par utilisateur auth.users, rôle 'admin' | 'membre' (D8).
-- La promotion admin se fait à la main en base (pas d'écran de gestion v1).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'membre' check (role in ('admin', 'membre')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Rôles applicatifs. id aligné sur auth.users. role : source de vérité de '
  'is_admin() (D8) ; le JWT ne porte pas le rôle.';
