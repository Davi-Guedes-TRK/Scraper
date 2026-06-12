# Plano — Jornada do Usuário e Transformação UX/UI do Painel TRK

> **Para quem executa (Sonnet):** este documento é o plano mestre. Execute as fases NA ORDEM.
> Cada tarefa tem critérios de aceite — não marque como concluída sem cumpri-los.
> Antes de construir qualquer feature sobre um campo do banco, VERIFIQUE no banco se o campo tem dados (regra do projeto).
> Idioma de toda a UI e de toda a comunicação: **português brasileiro**.

---

## 0. Contexto e princípios não-negociáveis

**O que é o sistema:** painel de captação e inteligência imobiliária da TRK Imóveis. Hoje é usado por 1 pessoa (Davi). O objetivo desta transformação é **liberar acesso para o resto da equipe** e evoluir o sistema de "ferramenta interna" para "produto".

**Stack atual (não mudar):** Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui, Supabase (auth SSR + Postgres), tema light/dark via CSS vars.

**Princípios de design (decididos, não rediscutir):**
1. **Monocromático + roxo accent** — o accent é `var(--chart-1)`. Usar SEMPRE variáveis do tema (`bg-primary`, `text-muted-foreground`, etc.), nunca hex hardcoded.
2. **"Cara de ERP" = estrutura**, não enfeite: densidade de informação, hierarquia tipográfica clara, Minimalism/Swiss (grid, espaço em branco, alto contraste).
3. Ícones: somente Lucide (já no projeto). Nunca emoji como ícone.
4. Transições 150–300ms, `transition-colors`; nada de scale que cause layout shift.
5. Toda lista/tabela tem: estado vazio, estado carregando (skeleton), estado de erro. Sem exceção.
6. Botões de ação assíncrona: `disabled` + spinner durante o submit. Nunca permitir duplo clique.
7. Filtros e abas refletidos na URL (query params) — toda visão é compartilhável por link.
8. Contraste mínimo 4.5:1 em ambos os temas; foco visível em navegação por teclado.

**Estado atual mapeado (jun/2026):**
- 14 páginas em `app/(app)/`: dashboard, triagem, in-loco (+ revisar), captacao, carteira-paralela, lancamentos, busca-pessoa, geoportal, visitas, relatorio (cartório), scrapers, analitico/funil, analitico/funil-inquilinos.
- Navegação em `components/navbar.tsx` — sidebar colapsável, grupos: Analítico / Captação / Campo / Documentos / Sistema.
- Auth: `app/(auth)/login` e `reset-senha` via Supabase SSR. **Sem roles, sem onboarding, sem RLS por usuário.**
- **Zero responsividade mobile** — e o grupo "Campo" (Visitas) é literalmente usado na rua.
- Já existem `components/welcome-overlay.tsx` e `splash-screen.tsx` como ponto de partida de primeiro acesso.

---

## 1. Personas e jornadas (a base de tudo)

O sistema hoje é organizado **por ferramenta** (scraper, geoportal, busca pessoa). A transformação central é reorganizar a experiência **por jornada**. Três personas:

### P1 — Captador/Corretor de rua ("Campo")
- **Objetivo:** sair com uma lista de visitas, chegar no prédio certo, registrar o que viu, converter em captação.
- **Contexto:** celular, na rua, conexão instável, uma mão ocupada.
- **Jornada-alvo:** Abrir app no celular → ver "minhas visitas de hoje" agrupadas por prédio/região → navegar até o endereço (deep link p/ Google Maps) → registrar resultado da visita em ≤3 toques → próxima visita.

### P2 — Operador de triagem/back-office ("Mesa")
- **Objetivo:** processar o fluxo de leads dos portais: triar, enriquecer (geoportal/busca pessoa), despachar para visita ou cartório.
- **Contexto:** desktop, sessões longas, produtividade por volume.
- **Jornada-alvo:** Abrir Triagem → fila clara do que está pendente → para cada imóvel: decisão rápida (descartar / visitar / aprofundar) com atalhos → enriquecimento (dono, matrícula, ônus) sem trocar de tela → despacho.

### P3 — Gestor ("Visão")
- **Objetivo:** saber se a captação está funcionando: funil, conversão, produtividade por pessoa.
- **Contexto:** desktop, olha 1–2x por dia, quer resposta em 10 segundos.
- **Jornada-alvo:** Abrir Dashboard → ver números do funil e tendência → drill-down em um gargalo → cobrar ação.

> **Tarefa 1.1 (entregável):** criar `docs/JORNADAS.md` com o mapa detalhado de cada jornada: passos, tela atual usada, atritos observados no código (ex.: triagem sem ação "Visitar" inline; tabela sem estado vazio), e tela-alvo. Este doc orienta as fases seguintes.
> **Aceite:** as 3 jornadas têm passo-a-passo numerado com referência a arquivos reais do repo.

---

## 2. Fase 1 — Fundação de acesso (pré-requisito para "liberar para o resto")

Nada de UX nova adianta se todos veem tudo de todos. Esta fase é backend+auth, mas é o alicerce da jornada.

### 2.1 Perfis e papéis
- Criar tabela `profiles` (id = auth.users.id, nome, papel: `captador` | `operador` | `gestor` | `admin`, avatar opcional).
- Trigger de criação automática de profile no signup.
- **Aceite:** novo usuário criado no Supabase aparece em `profiles` com papel default `captador`.

### 2.2 Escopo por usuário (RLS) — NÃO multi-tenant
- Conforme decisão de arquitetura existente: escopo por usuário via RLS nas tabelas operacionais sensíveis (começar por `cartorio_processos` → conceito "Meu Cartório"; visitas atribuídas ao captador).
- Tabelas de inteligência compartilhada (imóveis dos portais, geoportal) permanecem visíveis a todos os papéis.
- **Aceite:** usuário A não vê processos de cartório do usuário B; ambos veem a mesma triagem de portais.

### 2.3 Convite e primeiro acesso
- Fluxo de convite por e-mail (Supabase invite) — sem signup aberto ao público nesta etapa.
- Tela de primeiro acesso: definir senha → completar nome → escolher tema (light/dark) → cair no dashboard do seu papel.
- Evoluir `welcome-overlay.tsx` para um tour de 3–4 passos **pulável** (botão "Pular" sempre visível), específico por papel: captador vê tour de Visitas; operador vê tour de Triagem.
- **Aceite:** um e-mail convidado consegue, sem ajuda, sair do zero até a primeira ação útil (ver fila de triagem ou lista de visitas) em menos de 2 minutos.

### 2.4 Permissões na UI
- Sidebar (`components/navbar.tsx`) filtrada por papel: `captador` não vê Scrapers/Sistema; `gestor` vê tudo em leitura; ações destrutivas (descartar imóvel, submeter ônus) gated por papel.
- **Regra dura do projeto:** NUNCA submeter ônus/criar card Pipefy sem confirmação explícita do usuário na UI (modal de confirmação com resumo do que será enviado).
- **Aceite:** logar com cada papel mostra apenas os itens de menu e botões de ação permitidos.

---

## 3. Fase 2 — Arquitetura de navegação por jornada

Reorganizar a sidebar de "grupos de ferramentas" para "etapas da jornada". Manter as rotas (não quebrar links), mudar agrupamento e rótulos em `components/navbar.tsx`:

```
INÍCIO
  Dashboard                  (/dashboard — vira "home de próxima ação", ver Fase 5)

CAPTAR (o funil, na ordem em que acontece)
  Triagem                    (/triagem — renomear rótulo "Portais" → "Triagem")
  Enriquecer                 (/geoportal, /busca-pessoa — subitens)
  Visitas                    (/visitas)
  In Loco                    (/in-loco)
  Cartório                   (/relatorio — rótulo "Cartório")

CARTEIRAS (estoques que não são funil)
  Alugamos não Adm.          (/captacao)
  Carteira Paralela          (/carteira-paralela)
  Lançamentos                (/lancamentos)

ANALISAR
  Funil de Captação          (/analitico/funil)
  Funil de Inquilinos        (/analitico/funil-inquilinos)

SISTEMA (somente admin)
  Scrapers                   (/scrapers)
```

- Item ativo: indicador com accent roxo (`bg-primary/10 text-primary` + barra lateral), consistente expandido e colapsado.
- Badge de contagem da Triagem permanece (já existe), e adicionar badge em Visitas = visitas de hoje do usuário logado.
- Breadcrumb no topbar para páginas de nível 2 (ex.: In Loco → Revisar).
- **Aceite:** navegação espelha a ordem do funil; teste com papel `captador` mostra INÍCIO + CAPTAR apenas; nenhuma rota antiga quebra (redirects se necessário).

---

## 4. Fase 3 — Estados, feedback e fluidez (toda tela, checklist mecânico)

Passar página por página (as 14) aplicando o mesmo checklist. Fazer **uma página por commit** para revisão fácil. Ordem: triagem → visitas → relatorio → geoportal → busca-pessoa → in-loco → demais.

**Checklist por página:**
1. **Empty state** com ilustração leve (ícone Lucide grande em `text-muted-foreground`), frase do que significa e **uma ação** ("Nenhum imóvel na fila — rodar scraper agora" / "Sem visitas hoje — planejar a partir da Triagem").
2. **Skeleton** (`animate-pulse`) com a mesma geometria do conteúdo final (sem layout shift) para qualquer carregamento >300ms.
3. **Estado de erro** com mensagem em PT-BR e botão "Tentar novamente" — nunca tela branca ou erro cru.
4. **Botões assíncronos** desabilitados + spinner durante a operação.
5. **Filtros/abas na URL** (query params) — recarregar a página mantém o estado; link colado por colega abre a mesma visão.
6. **Toasts** de confirmação para toda mutação (criar/descartar/enviar), com "Desfazer" onde a operação for reversível.
7. `cursor-pointer` + feedback de hover em tudo que é clicável; foco visível por teclado.
8. Confirmação modal para ações destrutivas ou externas (descartar, submeter ônus, criar card Pipefy — com resumo do payload).

**Aceite por página:** simular (a) sem dados, (b) carregando com rede lenta, (c) erro de API — as três situações têm UI intencional. Filtros sobrevivem a F5.

---

## 5. Fase 4 — Mobile-first para o Campo (a maior lacuna)

Hoje não há um único breakpoint no app. A persona P1 usa o sistema NA RUA. Prioridade absoluta dentro da fase:

### 5.1 Infra responsiva
- Sidebar → no mobile vira **bottom navigation** (4 itens máx. para captador: Início, Visitas, In Loco, Triagem) ou drawer; topbar compacta.
- Alvos de toque ≥44×44px em toda a UI; fonte base ≥16px no mobile.
- Tabelas: no breakpoint `md` para baixo, trocar `<table>` por **cards empilhados** (campo-chave em destaque, secundários em `text-muted-foreground`). Onde card não couber, `overflow-x-auto` como fallback.
- **Aceite:** zero scroll horizontal em 375px em todas as páginas do grupo CAPTAR.

### 5.2 Jornada de visita mobile (a tela que vende o produto)
- `/visitas` em 375px: lista do dia agrupada por prédio/região (regra do projeto: visitas com endereço aproximado se agrupam por prédio), ordenada por proximidade/rota.
- Card de visita: endereço, foto do anúncio, valor, botões grandes — **"Navegar"** (deep link `https://maps.google.com/?q=` ou `geo:`), **"Registrar resultado"** (sheet de baixo com 3–4 opções: captado / dono não estava / recusou / reagendar + campo de nota com ditado do teclado).
- Registro offline-tolerante: se a mutação falhar por rede, guardar em `localStorage` e reenviar (fila simples), com indicador "pendente de sincronização".
- A ação **"Visitar"** na Triagem (regra do projeto) cria a visita já agrupada ao prédio existente quando o endereço aproximado bate.
- **Aceite:** no celular real, registrar o resultado de uma visita leva ≤3 toques a partir da lista; perder o sinal durante o registro não perde o dado.

### 5.3 In Loco mobile
- `/in-loco` otimizado para captura em pé: botão de câmera/upload grande, formulário em uma coluna, autosave de rascunho.
- **Aceite:** fluxo completo de registro in loco executável com uma mão em 375px.

---

## 6. Fase 5 — Dashboard como "home de próxima ação"

O dashboard deixa de ser só números e vira o ponto de partida da jornada, variando por papel:

- **Captador:** "Suas visitas hoje (N)" com CTA, pendências de in-loco para revisar, últimas captações suas.
- **Operador:** fila de triagem (N novos desde ontem), enriquecimentos pendentes (sem dono identificado / sem matrícula), processos de cartório aguardando resposta ("Meu Cartório").
- **Gestor:** funil compacto (entrada → triados → visitados → captados) com variação semanal, ranking de captadores, gargalo destacado em roxo.
- Cada cartão é clicável e leva à tela já filtrada (deep link com query params — depende da Fase 3.5).
- **Aceite:** para cada papel, a pergunta "o que eu faço agora?" é respondida acima da dobra, e todo número é clicável até a lista que o originou.

---

## 7. Fase 6 — Polimento e identidade de produto

1. **Página de login** com cara de produto: logo, tagline ("Inteligência de captação imobiliária"), tema monocromático+roxo, dark por padrão respeitando `prefers-color-scheme`.
2. **Consistência tipográfica:** definir escala única (ex.: títulos de página `text-lg font-semibold`, eyebrows de grupo como já existem na sidebar) e aplicar em todas as páginas; remover variações ad hoc.
3. **Densidade:** revisar tabelas desktop para densidade de ERP (linhas compactas, zebra sutil com `bg-muted/40`), cabeçalhos fixos (`sticky top-0`) em listas longas.
4. **Micro-feedback:** transições de navegação suaves, `prefers-reduced-motion` respeitado, contagem de badges animada sem distração.
5. **Acessibilidade final:** varredura de contraste nos dois temas, `aria-label` em todos os botões de ícone, ordem de tab natural.
6. **Nomes voltados ao usuário:** revisar rótulos internos que vazam jargão de implementação ("Scrapers" → "Coletas" para não-admin se exposto; "relatorio" segue exibido como "Cartório").
- **Aceite:** checklist de pré-entrega da skill ui-ux-pro-max (sem emoji-ícone, cursor-pointer, contraste, foco, reduced-motion, responsivo em 375/768/1024/1440) passa em todas as páginas.

---

## 8. Ordem de execução e dependências

```
Fase 1 (acesso/roles/onboarding)  ← bloqueia liberar para a equipe
   ↓
Fase 2 (navegação por jornada)    ← barata, alto impacto percebido
   ↓
Fase 3 (estados/feedback)         ← mecânica, 1 página por commit
   ↓
Fase 4 (mobile Campo)             ← maior valor novo; 5.2 é a tela-vitrine
   ↓
Fase 5 (dashboard por papel)      ← depende de roles (F1) e deep links (F3)
   ↓
Fase 6 (polimento)                ← contínuo, fechamento
```

**Regras de execução para o Sonnet:**
- Trabalhar SEMPRE neste clone (`ERP_TRK`) — existe um clone divergente na raiz que NÃO é o canônico.
- Commits pequenos e temáticos; mensagem em PT-BR descrevendo o efeito para o usuário, não a implementação.
- Antes de criar qualquer estrutura nova no banco, verificar o que já existe (tabelas, views — `imoveis_todos` é VIEW de 5 portais; alterações exigem `CREATE OR REPLACE`).
- Não depender de Gemini em volume (quota mínima) — features de IA usam Geoportal/GPS/Nido/Tesseract.
- Em dúvida de produto (ex.: rótulo, agrupamento), seguir este plano; em lacuna do plano, perguntar ao Davi em vez de inventar.
- Ao final de cada fase: atualizar a seção "Status" abaixo.

## Status

- [x] Tarefa 1.1 — docs/JORNADAS.md
- [x] Fase 1 — Fundação de acesso (commit 4b0cbe2 — migration SQL pendente de executar no Supabase)
- [x] Fase 2 — Navegação por jornada
- [ ] Fase 3 — Estados e feedback (0/14 páginas)
- [ ] Fase 4 — Mobile Campo
- [ ] Fase 5 — Dashboard por papel
- [ ] Fase 6 — Polimento
