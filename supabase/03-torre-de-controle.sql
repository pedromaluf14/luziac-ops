-- LUZIAC Ops — atualização 03: Torre de controle (alertas das campanhas)
-- Cole tudo no SQL Editor do Supabase e clique em Run (uma vez só).
-- Os alertas são gravados pela rotina do GitHub (scripts/torre.py) com a secret key;
-- a equipe logada só lê e marca como "visto".

create table if not exists public.alertas (
  id            text primary key,              -- tipo + conta + item (o mesmo alerta não duplica)
  cliente       text references public.clients(id) on delete set null,
  conta         text,                          -- nome da conta de anúncio
  plataforma    text,                          -- meta | google
  tipo          text not null,                 -- verba | cpl_meta | cpl_piorou | sem_lead | conta_parada | conv_zerada
  nivel         text not null default 'atencao', -- urgente | atencao
  titulo        text not null,
  detalhe       text,
  numeros       jsonb not null default '{}'::jsonb,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvido_em  timestamptz,
  visto_por     text,
  visto_em      timestamptz
);

create table if not exists public.torre_status (
  id              int primary key default 1,
  ultima_execucao timestamptz,
  contas          int,
  erro            text
);
insert into public.torre_status (id) values (1) on conflict (id) do nothing;

alter table public.alertas      enable row level security;
alter table public.torre_status enable row level security;
drop policy if exists "equipe le alertas"      on public.alertas;
drop policy if exists "equipe marca alertas"   on public.alertas;
drop policy if exists "equipe le status torre" on public.torre_status;
create policy "equipe le alertas"      on public.alertas      for select to authenticated using (true);
create policy "equipe marca alertas"   on public.alertas      for update to authenticated using (true) with check (true);
create policy "equipe le status torre" on public.torre_status for select to authenticated using (true);

alter publication supabase_realtime add table public.alertas;
