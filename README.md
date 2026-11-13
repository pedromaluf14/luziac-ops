# LUZIAC Ops

Tarefas da equipe LUZIAC. Cada tarefa tem cliente, responsável e um **checklist de etapas com dono**:
a tarefa fica "com" quem tem a próxima etapa pendente, e aparece nos avisos "Para você" dessa pessoa.

- **Quadro**: Kanban (A fazer → Em andamento → Aguardando cliente → Concluído), com filtros
- **Clientes**: todas as tarefas de cada cliente
- **Equipe**: perfil de cada pessoa, com tudo que ela tem, agrupado por cliente; dá para marcar a etapa como feita direto ali
- **Modelos**: checklists prontos (Criativo estático, Gravação…) para criar tarefas mais rápido

Tela: `index.html`, `style.css`, `app.js` (GitHub Pages). Dados e login: Supabase (`supabase/*.sql`, rodar em ordem).

## Ajustes do dia a dia
- Equipe e funções: `TEAM` no topo de `app.js`
- Etapas do Kanban: `COLS` em `app.js`
- Usuários: Supabase → Authentication → Users → Add user (com Auto Confirm). No primeiro acesso a pessoa escolhe o próprio nome.
