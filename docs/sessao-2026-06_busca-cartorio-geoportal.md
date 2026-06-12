# Sessão — Busca Pessoa, Cartório 2º Ofício e Geoportal (jun/2026)

Registro de tudo que foi construído, decidido e o estado atual. Serve de handoff.

---

## 1. Busca Pessoa (CPF/CNPJ) — `/busca-pessoa`

Lookup via **bot do Telegram** (não tem API). Usa a conta do Davi via MTProto (GramJS, pacote `telegram`).

- `lib/cpf-lookup.ts` — conecta com `TELEGRAM_SESSION`, manda `/cpf4 <cpf>` ou `/cnpj <cnpj formatado>` no grupo **Skynet VIP Oficial 🥇**; o bot **UnixGruposRobot** (id 8781521198) responde na DM com botão cujo URL é `ifnconsultoria.org/.../cpfN.php?id=...`; faz fetch + parseia o HTML.
- `app/api/busca-pessoa/route.ts` — `POST { query }`, `maxDuration=60`.
- `app/(app)/busca-pessoa/` — página (menu Captação).
- CPF → nome/idade/renda/telefones (+ e-mails, adicionado depois pelo Davi). CNPJ → empresa + sócio-administrador (lookup de CPF encadeado; fallback p/ dados da empresa).

**Detalhes que custaram:**
- Correlação: registra o maior `id` de msg de cada bot ANTES de enviar e busca com `minId` (filtro por timestamp falhava — resposta cacheada tem `date` antigo).
- CNPJ: comando é `/cnpj` (sem o 8), formato `00.000.000/0000-00`.
- `TELEGRAM_SESSION` no `.env.local` e no Vercel (Production). Setup 1x: `C:\Users\atend\cpf-lookup\setup-session.mjs` (api_id 30061221). Sessão dura meses.

---

## 2. CI / GitHub Actions (endurecimento)

- 9 workflows de scraper: `cache: pip`, `timeout-minutes`, `concurrency`.
- `scripts/requirements.txt` e `requirements-playwright.txt` (deps Python pinadas).
- Novo `ci.yml`: TypeScript + `next build` em todo push/PR.
- `package.json`: removido `nodemailer` (não usado); **`xlsx` mantido** (usado em `relatorio-client` p/ exportar Excel — o audit errou ao dizer que não era usado); adicionado script `typecheck`.

---

## 3. Cartório 2º Ofício — automação do fluxo de e-mail

Só se solicita a **matrícula** ao 2º Ofício (`certidao.onus@2ridf.com.br`, canal e-mail).

**Arquitetura do loop (o comentário no código dizia "Resend" — É MENTIRA):**
- Envio: Next.js `POST /api/cartorio/enviar-email` → Google Apps Script (`GmailApp.sendEmail`) em `scripts/cartorio_apps_script.js`.
- Recebimento: o MESMO Apps Script roda `verificarRespostas` a cada 5 min, busca `from:certidao.onus@2ridf.com.br` no Gmail e faz POST pro `/api/cartorio/inbound`.

**Feito:**
- **Correlação determinística**: 1 e-mail por imóvel, com ref `[#XXXXXX]` (djb2 do link) no ASSUNTO. Inbound casa pela ref (`parseRefFromSubject` + `refForLink` em `lib/cartorio.ts`), fuzzy por endereço só de fallback. Extrai matrícula tolerando "matrícula do imóvel é 145.678" e milhar. Tudo testado.
- Status automatizado: `pendente → enviado → recebido → completo`. Inbound seta `recebido` + cria card Pipefy "COM - Oportunidades" (NÃO preenche form de ônus — isso é `pipefy_portal_fill.py`, on-prem, manual).
- `relatorio` GET expõe `status_solicitacao_em` (visibilidade "enviado há X dias").
- Log via **Google Chat** (`lib/gchat.ts` + `cartorioMsg`); `GCHAT_WEBHOOK_URL` já configurado pelo Davi.
- **Bug corrigido**: Apps Script apontava p/ placeholder `SEU-APP.vercel.app` → `erp-trk.vercel.app`. ⚠️ Precisa **re-colar no editor do Google Apps Script** (editar o repo NÃO atualiza o que roda).

---

## 4. Geoportal — PoC de candidatos de lote

Resolve endereço impreciso → lote provável do **IDE-DF**, alimentando o gate de auto-envio.

- `lib/wfs-idedf.ts` `buscarCandidatos({lat,lng | quadra,conjunto,setor})` — WFS `https://catalogo.ipe.df.gov.br/geoserver/wfs`, typeName `geonode:lote_registrado`. Atributos: `setor`, `quadra` ("QNN 24","QI 7","SQN 303"), `conjunto` ("CJ H"), `lote` ("LT 18"), `area_proj`, `end_siturb`/`end_cart`. **Sem campo de piscina.**
- `lib/geoportal-candidates.ts` `acharCandidatos()` — ranqueia por área (`area_proj` vs `area_m2`, 0.4) + tokens de endereço (0.6) + **número do lote como desempate decisivo** (match único → confiança ALTA). `anotarPiscina()` = SEAM da visão (SAM 2), no-op (não inventa piscina).
- `app/api/geoportal/candidatos/route.ts` — endpoint.
- `lib/endereco-df.ts` `parseEnderecoDF()` — extrai **setor/quadra/conjunto/lote** do começo de endereço do PRÓPRIO anúncio (bairro/título). SÓ família-Q (casa/lote); superquadra/comercial (SQNW/SCS/CRNW) não parseiam de propósito. `ehCasaLote(tipo_imovel)` — apartamento/sala/kitnet pulam.
- **Triagem**: ao abrir um anúncio de casa/lote, auto-carrega candidatos do texto dele; clicar preenche endereço + `fonte='geoportal'`.

**Cobertura real (verificada, honesta):**
- ✅ Lotes de RA — **QR/QS/QN/QNM** (Samambaia/Recanto/Ceilândia/Gama): conjunto casa, com lote → alta.
- ✅ **Lago Sul (SHIS)**: funciona passando `setor=SHIS` (desambigua de SRIA/Indústria).
- ❌ **Lago Norte (SHIN)**: NÃO está no cadastro (`setor=SHIN` → 0). Mostra nada (honesto) em vez de lixo.
- ❌ Superquadra/comercial (SQN/SHCGN/CLN) e OLX vago: fora (cadastro não cobre / texto não parseável).
- **Hierarquia de desempate**: setor corrige RA errada → conjunto+lote estreita → piscina (visão, futuro) é só o desempate final entre lotes idênticos. Piscina NÃO conserta setor errado.

---

## 5. Gatilho automático PoC → gate — `/api/cartorio/auto`

`lib/cartorio-auto.ts` `rodarAuto2Oficio({limite, dryRun})`:
1. pega aprovados do 2º Ofício sem solicitação (`status_solicitacao IN null|'pendente'`) e sem matrícula;
2. nos casa/lote sem endereço grau-cartório, roda a PoC; confiança ALTA grava `endereco_fonte='geoportal'` + endereço oficial;
3. envia (gate `auto:true`) só os 'geoportal' via `solicitarMatriculas` (`lib/cartorio-envio.ts`).
- `dryRun` simula sem enviar. Log no GChat. Auth: header `x-api-key = SCRAPER_API_KEY`.
- Workflow `auto-cartorio-2oficio.yml`: **workflow_dispatch, dryRun=true default, schedule COMENTADO** (ligar só após validar). Mandar e-mail ao cartório é irreversível.
- **Gate de confiança** = coluna `endereco_fonte` ('geoportal'|'maps'|null) nas 7 tabelas-base + view; gravada na triagem (resolve-maps devolve `source`).

---

## 6. Banco (Supabase) — migrations aplicadas nesta sessão

- `endereco_fonte text` nas 7 tabelas de portal (`scripts/sql/add_endereco_fonte.sql`).
- **View `imoveis_todos` recriada** p/ expor `endereco_fonte` + `status_solicitacao_em` (era VIEW de 5 portais: dfimoveis/olx/vivareal/zap/chavesnamao — NÃO tem wimoveis/facebook).
- ⚠️ **GOTCHA**: adicionar coluna nas tabelas-base NÃO aparece na view — tem que `CREATE OR REPLACE VIEW`. Scripts descartáveis: `scripts/_migrate_endereco_fonte.mjs`, `scripts/_fix_view_imoveis_todos.mjs`.
- ⚠️ O MCP `mcp__postgres__query` aponta p/ OUTRO banco (192.168.x, local, inalcançável) e é read-only. Pra rodar SQL no Supabase: `DATABASE_URL` do `.env.local` via pacote `postgres` (ver `lib/db.ts`).

---

## 7. Backlog concluído (sessão jun/12)

14 tarefas — todas concluídas:
- ✅ #1 Lançamentos bairro: fallback getBairro (commit a89e1eb)
- ✅ #2 Topbar: removido dropdown de tempo (commit a89e1eb)
- ✅ #3 Topbar: "atualizado X ago" quando em /lancamentos (fetchs /api/empreendimentos?stats=1)
- ✅ #4 Wimoveis: criado `scripts/wimoveis_sync.py` + `.github/workflows/wimoveis-sync.yml` + `scripts/_add_wimoveis_to_view.mjs`
- ✅ #5 Facebook: removido de schema, API, data-source-bar (commit a89e1eb)
- ✅ #6 Pipefy webhook: registrado (id 300685412), já existia
- ✅ #7 DFImóveis/OLX: ambos rodando com success todo dia
- ✅ #8 Funil Inquilinos labels
- ✅ #9 Funil Inquilinos: linha "Saídas da Adm" no gráfico mensal (queries leads_nao_adm por mes)
- ✅ #10 Triagem: Chaves na Mão removido
- ✅ #11 Triagem: filtros de região/tipo
- ✅ #12 Aluguel não adm: filtro por tempo já implementado (commit fdaee96)
- ✅ #13 Carteira paralela: VK + filtros (commit a89e1eb)
- ✅ #14 Captado p/ corretor: auto-card no /api/imoveis quando is_insert + loca + corretor + telefone

**Pendente manual (Davi):** rodar `node scripts/_add_wimoveis_to_view.mjs` para incluir wimoveis na view imoveis_todos.

## 8. Estado / deploy

- Tudo em produção em **erp-trk.vercel.app** (deploy via `vercel --prod`).
- Git reconectado: o `gh` tinha token válido mas o git usava credencial velha; resolvido com `gh auth setup-git`.
- Último commit deployado: `fix(geoportal): candidatos só para casa/lote, nunca apartamento` (92182ce).

### ⚠️ PENDENTE — mudança NÃO commitada/deployada
A **desambiguação por setor** (passar `setor` SHIS/SHIN p/ a query) foi editada em `lib/endereco-df.ts`, `triagem-client.tsx` e `lib/cartorio-auto.ts`, mas o `tsc` foi interrompido antes de validar/commitar. **Falta: `npx tsc --noEmit` → commit → `vercel --prod`.**

---

## 8. Pendências / follow-ups

1. **Re-colar `cartorio_apps_script.js`** no editor do Google (a correção da URL só vale lá).
2. Finalizar o deploy da desambiguação por setor (item acima).
3. Ligar o **schedule** do `auto-cartorio-2oficio.yml` após assistir dry-runs.
4. **Lago Norte (SHIN)** não está no cadastro IDE-DF — investigar fonte alternativa se for prioridade.
5. **Camada de visão (piscina/SAM 2)** — desempate final entre lotes idênticos; exige GPU/satélite (Colab T4); ainda não construída.
6. `pistas_ia` foi **ABANDONADO** (nunca terá dados) — o sinal de endereço vem do texto do anúncio ou do pin do Maps.

---

## 9. Aprendizados

- **Verificar dados reais ANTES de construir** feature em cima de um campo (perdi tempo construindo sobre `pistas_ia` que estava vazio; e assumindo formato de `status_solicitacao`).
- O **pin do Google Maps** continua sendo o caminho robusto p/ qualquer imóvel (resolve-maps → geoportal direto → confiança alta).
- WFS do IDE-DF oscila (502) sob chamadas rápidas em loop e exige User-Agent; testar pelo endpoint de produção (que tem o client certo) é mais confiável que `fetch` cru do node.
