# LUZIAC Ops — instruções para o Claude

Sistema interno da **LUZIAC** (agência de marketing imobiliário): tarefas da equipe com checklist por etapa,
visão por cliente e por pessoa, modelos de tarefa e a **Torre de controle** (alertas das campanhas).
Quem pede ajustes é a equipe da LUZIAC, em português, sem jargão técnico. Responda em português.

## Como funciona
- **Tela**: `index.html` + `style.css` + `app.js`, sem build, publicados pelo GitHub Pages (`main` / raiz).
  Endereço: https://pedromaluf14.github.io/luziac-ops/
- **Dados e login**: Supabase (projeto "LUZIAC Ops", região São Paulo). URL e chave pública em `config.js`
  (a chave publishable é feita para o navegador; quem protege os dados é o login + RLS).
- **Banco**: os arquivos em `supabase/` são aplicados à mão, em ordem, no SQL Editor do Supabase.
  Mudança de estrutura = **novo arquivo numerado** (`04-...sql`), nunca editar um que já rodou.
  Avise a pessoa que ela precisa rodar o arquivo; o Claude não acessa o Supabase daqui.
- **Torre de controle**: `scripts/torre.py`, rodando de hora em hora em `.github/workflows/torre.yml`.
  Busca Meta Ads e Google Ads no Windsor.ai e grava na tabela `alertas` com a secret key.
  Secrets do repositório: `WINDSOR_API_KEY`, `SUPABASE_SERVICE_KEY`. **Nunca** peça essas chaves no chat
  nem as coloque no código.

## Regras do produto (não quebrar)
- **Simples acima de tudo.** A equipe não é técnica; nada que assuste ou dê trabalho extra. Poucos campos, poucas etapas.
- Tarefa = card com cliente, responsável, entrega e **checklist de etapas, cada uma com dono e prazo**.
  A tarefa fica "com" quem tem a **próxima etapa pendente** (`holder()` em `app.js`); é isso que alimenta
  os avisos "Para você" e o perfil da pessoa.
- Etapas do Kanban (`COLS`): A fazer → Em andamento → Aguardando cliente → Concluído. Mudam sozinhas pelo checklist.
- Equipe e funções: `TEAM` em `app.js`. Cada pessoa escolhe o próprio nome no primeiro acesso (`user_metadata.nome`).
- Clientes ficam na tabela `clients` (id = slug). Contas de anúncio → cliente: `ACCOUNT_CLIENT` / `NAME_HINTS` em `scripts/torre.py`.
- Visual = padrão LUZIAC dos painéis: grafite + magenta `#FB2576`, fonte Epilogue, escuro por padrão com
  interruptor de modo claro. Logos em `assets/`. Funciona no celular (~390px) sem rolagem horizontal.

## Regras das campanhas (Torre de controle)
- Os números têm que bater com o Gerenciador de Anúncios. **Lead = "Leads (formulário)"**:
  campo Windsor `actions_onsite_conversion_lead_grouped` (nunca `actions_lead`).
- Semana = 7 dias completos até ontem, comparada com os 7 anteriores. CPL = gasto ÷ leads do período.
- Verba: dias de fôlego = (limite de gastos − valor gasto) ÷ gasto médio dos últimos 7 dias (valores do Meta em centavos ÷ 100).
- Só alertas que pedem ação; nada de alarme falso. Limites no topo de `scripts/torre.py`.
- Se uma plataforma falhar no Windsor, os alertas dela **não** são dados como resolvidos.

## Ao mudar o código
1. `git pull --rebase` antes de começar (mais de uma pessoa trabalha aqui).
2. Teste localmente (servidor estático + navegador headless, com um Supabase simulado), em escuro, claro e celular.
3. Atualize o `?v=` de `style.css`, `config.js` e `app.js` no `index.html` (evita o navegador misturar versão antiga e nova).
4. Commit e push em `main`. O Pages publica em ~1 min; peça Ctrl+F5.
5. Para rodar a Torre na hora: `gh api -X POST repos/pedromaluf14/luziac-ops/actions/workflows/torre.yml/dispatches -f ref=main`.
