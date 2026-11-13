-- LUZIAC Ops — atualização 02: checklist com dono por etapa, modelos de tarefa e lista oficial de clientes
-- Cole tudo no SQL Editor do Supabase e clique em Run (uma vez só).

-- 1) Tarefas: checklist dentro da tarefa + data da última alteração
alter table public.tasks add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists atualizado_em timestamptz not null default now();

create or replace function public.ops_touch() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.ops_touch();

-- Etapas simplificadas: A fazer, Em andamento, Aguardando cliente, Concluído
update public.tasks set status = 'andamento' where status in ('producao','revisao','aprovado');

-- 2) Modelos de tarefa (ex.: Gravação, Criativos) com o checklist pronto
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  itens      jsonb not null default '[]'::jsonb,
  criado_em  timestamptz not null default now()
);
alter table public.templates enable row level security;
drop policy if exists "equipe le modelos" on public.templates;
drop policy if exists "equipe edita modelos" on public.templates;
create policy "equipe le modelos"    on public.templates for select to authenticated using (true);
create policy "equipe edita modelos" on public.templates for all    to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.templates;

insert into public.templates (nome, itens)
select * from (values
  ('Criativo estático', '[{"texto":"Copy","resp":""},{"texto":"Edição","resp":""},{"texto":"Aprovação interna","resp":""},{"texto":"Aprovação cliente","resp":""},{"texto":"Subir nas campanhas","resp":""}]'::jsonb),
  ('Gravação',          '[{"texto":"Organizar gravação","resp":""},{"texto":"Roteiro","resp":""},{"texto":"Gravação","resp":""},{"texto":"Upload e decupagem","resp":""},{"texto":"Edição","resp":""},{"texto":"Revisão e validação","resp":""},{"texto":"Aprovação com o cliente","resp":""},{"texto":"Agendamento","resp":""},{"texto":"Subir nas campanhas","resp":""}]'::jsonb)
) as v(nome, itens)
where not exists (select 1 from public.templates);

-- 3) Lista oficial de clientes
insert into public.clients (id, name) values
  ('abpi','ABPI'), ('acqua-ibiuna','Acqua Ibiúna'), ('altma','Altma'), ('azevedo','Azevedo'),
  ('bartozzi','Bartozzi Imóveis'), ('engefel','Engefel'), ('fd','F&D'), ('ico','Icó Real Parque'),
  ('lopes-abc','Lopes ABC'), ('dialogo-engenharia','Lopes Diálogo'), ('lopes-lil','Lopes LIL'),
  ('lotus','LOTUS GRU'), ('luziac-hub','LUZIAC HUB'), ('nova-caucaia','Nova Caucaia'),
  ('rede-lopes','Rede Lopes'), ('sancan','Sancan'), ('schmid','Schmid'), ('villasul','Villasul')
on conflict (id) do update set name = excluded.name;

-- Altma é o mesmo cliente que estava como Hive: tarefas passam para Altma
update public.tasks set cliente = 'altma' where cliente = 'hive';
delete from public.clients where id in ('hive','midrah','pedro-ornellas');
