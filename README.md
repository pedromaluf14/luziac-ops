# LUZIAC Ops

Quadro de tarefas da equipe LUZIAC: carga, atrasos e entregas por pessoa, e o fluxo de produção
(A fazer → Em produção → Em revisão → Aguardando cliente → Aprovado / publicar → Entregue).

- Tela: `index.html` + `app.js`, publicada pelo GitHub Pages
- Dados e login: Supabase (`supabase/schema.sql`)
- Configuração: `config.js` (URL e chave pública do Supabase)

## Ajustes do dia a dia
- Equipe, funções e áreas: constantes `TEAM` e `AREAS` no topo de `app.js`
- Etapas do fluxo: `COLS` em `app.js`
- Limite de carga por pessoa: `WIP` em `app.js`

## Acesso
Os usuários são criados no Supabase em Authentication → Users → Add user (e-mail e senha).
O cadastro público fica desligado: só entra quem foi adicionado.
