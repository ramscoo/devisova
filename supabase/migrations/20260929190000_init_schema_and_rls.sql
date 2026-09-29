-- Step 8.1 — Schema initial + RLS pour Devisio.
-- Concu pour correspondre a la structure actuelle du localStorage
-- (devisio_documents / devisio_clients / devisio_profile), sans rien
-- ajouter qui ne soit pas deja decide dans le document d'architecture.
--
-- Ce fichier n'est PAS encore applique a un projet Supabase : il est
-- pret a etre pousse (supabase db push, ou colle dans le SQL editor)
-- des qu'un projet existe. L'application (script.js) n'est pas
-- connectee a Supabase a ce stade.

-- ===================================================================
-- Fonction utilitaire : mise a jour automatique de updated_at
-- ===================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===================================================================
-- profiles — equivalent de devisio_profile, un par utilisateur
-- ===================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  ent_name text,
  ent_siret text,
  ent_adresse text,
  ent_tel text,
  ent_email text,
  logo_data text, -- data URL base64, identique au format localStorage actuel
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ===================================================================
-- clients — equivalent de devisio_clients
-- ===================================================================
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nom text not null,
  adresse text,
  created_at timestamptz not null default now()
);

create index clients_user_id_idx on public.clients(user_id);

-- ===================================================================
-- documents — equivalent de devisio_documents (devis ET factures)
-- ===================================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('devis', 'facture')),
  numero text not null,
  date timestamptz not null default now(),
  ent_name text,
  ent_siret text,
  ent_adresse text,
  ent_tel text,
  ent_email text,
  cli_name text,
  cli_adresse text,
  tva numeric not null default 20 check (tva in (20, 10, 5.5, 0)),
  devise text not null default 'EUR' check (devise in ('EUR', 'USD', 'XOF', 'GBP')),
  template text not null default 'classic' check (template in ('classic', 'modern', 'elegant', 'minimal')),
  lignes jsonb not null default '[]'::jsonb,
  logo_data text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, numero) -- garde-fou contre les collisions de numerotation multi-appareils
);

create index documents_user_id_idx on public.documents(user_id);
create index documents_user_type_idx on public.documents(user_id, type);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ===================================================================
-- subscriptions — Free / Pro mensuel / Pro annuel
-- Ecriture reservee au futur webhook (service_role) : voir policies.
-- ===================================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro_monthly', 'pro_annual')),
  status text not null default 'free' check (status in ('free', 'trialing', 'active', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ===================================================================
-- Provisioning automatique a la creation d'un compte :
-- chaque nouvel utilisateur recoit un profile vide + un abonnement free.
-- SECURITY DEFINER necessaire pour ecrire malgre la RLS (execution
-- controlee par Postgres au moment de l'insertion dans auth.users,
-- jamais invocable directement par le client).
-- ===================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.subscriptions (user_id, plan, status) values (new.id, 'free', 'free');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================================================================
-- Row Level Security
-- ===================================================================
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.documents enable row level security;
alter table public.subscriptions enable row level security;

-- ----- profiles : un utilisateur gere uniquement sa propre ligne -----
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_own on public.profiles
  for delete using (id = auth.uid());

-- ----- clients : CRUD uniquement sur ses propres clients -----
create policy clients_select_own on public.clients
  for select using (user_id = auth.uid());
create policy clients_insert_own on public.clients
  for insert with check (user_id = auth.uid());
create policy clients_update_own on public.clients
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy clients_delete_own on public.clients
  for delete using (user_id = auth.uid());

-- ----- documents : CRUD uniquement sur ses propres documents -----
create policy documents_select_own on public.documents
  for select using (user_id = auth.uid());
create policy documents_insert_own on public.documents
  for insert with check (user_id = auth.uid());
create policy documents_update_own on public.documents
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy documents_delete_own on public.documents
  for delete using (user_id = auth.uid());

-- ----- subscriptions : lecture seule pour le client -----
-- Volontairement AUCUNE policy insert/update/delete pour le role
-- "authenticated" : avec RLS active, l'absence de policy = refus par
-- defaut. Seul un role avec le privilege BYPASSRLS (service_role,
-- utilise exclusivement par l'Edge Function du futur webhook Stripe)
-- pourra ecrire dans cette table. Voir rapport Step 8.1, section 6.
create policy subscriptions_select_own on public.subscriptions
  for select using (user_id = auth.uid());
