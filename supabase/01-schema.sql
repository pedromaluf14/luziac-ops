-- LUZIAC Ops — estrutura do banco no Supabase
-- Cole tudo no SQL Editor do projeto e clique em Run (só precisa rodar uma vez).

create table if not exists public.clients (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  responsavel  text,
  area         text,
  cliente      text references public.clients(id) on delete set null,
  status       text not null default 'fazer',
  prioridade   text not null default 'media',
  prazo        date,
  notas        text,
  criado_em    timestamptz not null default now(),
  concluido_em timestamptz,
  criado_por   uuid default auth.uid()
);

-- Só quem fez login (a equipe) lê e escreve. Visitantes do link não veem nada.
alter table public.clients enable row level security;
alter table public.tasks   enable row level security;

create policy "equipe le clientes"      on public.clients for select to authenticated using (true);
create policy "equipe edita clientes"   on public.clients for all    to authenticated using (true) with check (true);
create policy "equipe le tarefas"       on public.tasks   for select to authenticated using (true);
create policy "equipe edita tarefas"    on public.tasks   for all    to authenticated using (true) with check (true);

-- Atualização ao vivo entre quem está com o quadro aberto
alter publication supabase_realtime add table public.tasks, public.clients;

-- Clientes iniciais
insert into public.clients (id, name) values
  ('lopes-abc','Lopes ABC'), ('lopes-lil','Lopes LIL'), ('rede-lopes','Rede Lopes'),
  ('dialogo-engenharia','Diálogo Engenharia'), ('azevedo','Azevedo Imobiliária'), ('midrah','Midrah'),
  ('lotus','LOTUS'), ('abpi','ABPI'), ('pedro-ornellas','Pedro Ornellas'),
  ('sancan','Sancan (Nova Caucaia)'), ('ico','Icó'), ('hive','Hive'), ('engefel','Engefel')
on conflict (id) do nothing;
