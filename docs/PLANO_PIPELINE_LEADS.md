# Plano — Organização de bugs + Pipeline automatizado de leads (jun/2026)

Objetivo: volume máximo de leads qualificados com **um único ponto humano** — a validação de endereço na triagem (Street View/Maps). Todo o resto roda sozinho. Este doc é a fonte única de verdade do backlog e do roadmap.

---

## O fluxo-alvo (desenhado pelo Davi)

```
anúncio chega (scrapers, 5-7 portais)
  └─> [HUMANO] triagem: busca endereço no Street View, valida, aprova
        └─> sistema solicita MATRÍCULA ao cartório (e-mail)          ✅ existe (2º Ofício)
              └─> recebe matrícula, trata endereço p/ forma oficial   ✅ existe (parcial)
                    └─> DEDUP: imóvel já existe no dw_trk?            ❌ novo
                          ├─ SIM → avisar (Google Chat) e marcar card ❌ novo
                          └─ NÃO → solicitar ÔNUS                     ❌ novo (hoje manual)
                                └─> ônus chega no e-mail → OCR        ❌ novo
                                      └─> extrai PROPRIETÁRIO + CPF   ❌ novo
                                            └─> proprietário no dw_trk?
                                                  ├─ SIM → puxa contato do dw_trk      ❌ novo
                                                  └─ NÃO → busca-pessoa (Telegram bot) ✅ existe
                                                        └─> contato no card Pipefy
                                                            "COM | Oportunidades"
                                                            (card atualizado a CADA etapa) ❌ parcial
```

Princípio: **cada etapa nova só dispara gasto (matrícula/ônus custam R$) se a anterior passou no gate de confiança.** O dedup vem ANTES da ônus exatamente por isso.

---

## PARTE A — Backlog único de bugs (consolidado)

Regra: bug novo entra AQUI (com prioridade), não em mensagem solta. Sessões futuras leem este doc primeiro.

### P0 — quebrado ou bloqueando produção
| # | Bug | Causa conhecida | Fix |
|---|-----|----------------|-----|
| B1 | ~~"Lago Sul" sumiu do filtro da triagem~~ **RESOLVIDO** (jun/12) | Dropdown era só-dinâmico (`getRegiao()` sobre os itens carregados); sem item de Lago Sul na fila a opção sumia. | Fix em `140c841`: `BAIRROS_FIXOS` (8 RAs TRK) mesclada com a lista dinâmica. Deployado. |
| B2 | **Apps Script do cartório desatualizado no Google** | Correção da URL (`erp-trk.vercel.app`) só existe no repo; o que RODA é o que está colado no editor do Google. | Re-colar `scripts/cartorio_apps_script.js` no editor (ação manual do Davi, 5 min). Sem isso o inbound de matrícula não chega. ⚠️ ÚNICO P0 restante. |
| B3 | ~~Webhook Pipefy não registrado~~ **RESOLVIDO** | Já estava registrado (id 300685412, "erp-trk-realtime") — verificado em jun/12 com token fresco. Gotcha: `_register_pipefy_webhook.mjs` lê `PIPEFY_TOKEN` do `.env.local` (stale); o refresh grava em `credentials/pipefy_token.txt` — passar via `$env:PIPEFY_TOKEN`. | — |
| B4 | ~~Desambiguação por setor (SHIS/SHIN)~~ **RESOLVIDO** (jun/12) | Commitada em `e0c09fa`. | Deployado em produção (jun/12). |

### P1 — dados errados / funcionalidade degradada
| # | Bug | Detalhe |
|---|-----|---------|
| B5 | Lançamentos sem bairro | `bairro` vem de `empreendimentos_all`, scrapers gravam de forma frágil; `getBairro()` no client só mascara. Verificar cobertura real no banco e corrigir nos scrapers. |
| B6 | Funil lê `ILIKE links_anuncio` em vez do enum `origem` | `app/api/pipefy/funil/route.ts` — classificação de origem frágil. |
| B7 | View `imoveis_todos` não inclui wimoveis/facebook | Só 5 portais. Decidir: incluir ou aposentar essas fontes (tasks #4/#5 do backlog de jun/12). |
| B8 | Lago Norte (SHIN) fora do cadastro IDE-DF | Geoportal devolve 0 (honesto). Investigar fonte alternativa (SEDUH/TERRACAP?) se Lago Norte for prioridade comercial. |

### P2 — backlog de jun/12 remanescente
Tasks #2/#3 (topbar), #7 (DF/OLX), #9/#12/#13/#14 — manter na lista de TaskCreate, migrar descrição pra cá quando virarem trabalho ativo.

---

## PARTE B — Roadmap do pipeline (fases)

### Fase 0 — Destravar o que já existe (1 sessão)
1. B1–B4 acima. Sem B2/B3 nada do loop automático funciona de ponta a ponta.
2. Assistir 2-3 dry-runs do `auto-cartorio-2oficio.yml` e **ligar o schedule** (e-mail ao cartório é irreversível — só ligar depois de validar).

### Fase 1 — Card Pipefy como espelho vivo do lead
O card em "COM | Oportunidades" precisa ser ATUALIZADO a cada etapa, não só criado.
- `lib/pipefy.ts`: função `updateCardFields(cardId, campos)` (GraphQL `updateCardField`).
- Persistir `pipefy_card_id` na linha do imóvel ao criar o card (hoje a correlação se perde).
- Cada evento do pipeline (matrícula recebida, dedup, ônus, proprietário, contato) escreve no card + log no GChat.
- Definir os campos do card: status da etapa, matrícula, endereço oficial, proprietário, CPF, telefones, flag "já existe no dw_trk".

### Fase 2 — Dedup contra o dw_trk ✅ CONSTRUÍDA (jun/12)
- **Ponte**: `scripts/dw_sync.mjs` roda como **Tarefa Agendada "ERP_TRK dw_sync"** (8h30, diária, StartWhenAvailable) na máquina do Davi — a única que alcança `192.168.64.106:5432/dw_trk` (`DW_TRK_URL` no `.env.local`). Log em `%LOCALAPPDATA%\erp_trk_dw_sync.log` + ping no GChat. Espelha `nido_imoveis` (11.3k) e `nido_pessoas` (119k) → `dw_imoveis`/`dw_pessoas` no Supabase (`scripts/sql/create_dw_mirror.sql`).
- **Normalizador**: `lib/endereco-normalizar.ts` — `enderecoNorm()` (string canônica), `chaveEndereco()` (chave estruturada `QI 11|CJ 7|17`; setor SHIS/SHIN fica FORA da chave e só confirma/derruba), `nomeNorm()`. Self-contained de propósito: o Node 24 importa o .ts direto no script de sync — UMA fonte de verdade nos dois lados.
- **Dedup**: `lib/dw-dedup.ts` (`buscarImovelNoDw`, `buscarPessoaNoDw`) + endpoint `POST /api/dw/dedup`. Níveis: `exato` (chave igual + setor compatível) / `provavel` (trgm > 0.5, só em linhas sem chave) / `nenhum` (libera ônus). 65% do espelho tem chave estruturada.
- ⚠️ **Nido NÃO tem CPF** em `nido_pessoas` — match de proprietário é por **nome normalizado** (homônimos possíveis; tratar como "provável forte"). Validado: dedup achou a mesma casa do Lago Sul 3x duplicada no próprio Nido.
- Falta (vira Fase 3): chamar o gate no fluxo real (cartorio-auto/triagem) → existe → GChat + card "JÁ NA BASE"; não existe → solicitar ônus.

### Fase 3 — Ônus automatizada + extração + proprietário ✅ CONSTRUÍDA (jun/12)
Estado em `onus_pipeline` (tabela nova — evita mexer nas 7 tabelas+view). Fluxo implantado:
1. **Gate** (`lib/onus-gate.ts`): matrícula chega no `/api/cartorio/inbound` → dedup no espelho →
   `exato` = GChat "JÁ NA BASE" + card `tem_cadastro_no_nido='Sim'`, NÃO solicita ·
   `provavel` = GChat com candidatos (humano decide) · `nenhum` = entra na fila da ônus.
2. **Solicitar ônus**: o pipe do form SEC | Ônus **não é visível pro token do Davi** (outro time) → caminho é o form público mesmo: `pipefy_portal_fill.py --from-gate [--submit]` lê a fila do `onus_pipeline` e marca `onus_solicitada_em` após enviar. **Tarefa Agendada "ERP_TRK onus_fill" (10h, DESABILITADA)** — ligar só após validar um dry-run com fila real (`Enable-ScheduledTask "ERP_TRK onus_fill"`).
3. **Inbound da ônus** (`/api/onus/inbound`): Apps Script detecta PDF anexo do cartório e POSTa base64 → **Gemini 2.5 Flash** extrai `{matricula, proprietarios[nome,cpf], onus_ativos}` (lê PDF digital E escaneado; sem custo novo — mesma GEMINI_API_KEY; decisão: Gemini em vez de Claude vision por custo) → correlaciona pela MATRÍCULA → CPF validado por dígito verificador.
4. **Cadeia de contato**: nome → `dw_pessoas` (espelho; Nido não tem CPF, match por nome) → senão CPF → `lookupCPF` (Telegram, já existia) → senão GChat pede busca manual. Contato + ônus + co-proprietários → card COM-Oportunidades (`atualizarCardOportunidade` em `lib/pipefy.ts`).
5. **Apps Script reescrito** (`scripts/cartorio_apps_script.js`): rastreio por timestamp de MENSAGEM (Script Properties) em vez de label por thread — ônus que chega como resposta em thread já processada não se perde. ⚠️ **Re-colar no editor do Google** (de novo).

### Fase 4 — Dashboard "bolsa de valores"
Página `/pregao` (ou reformular `/dashboard`): o funil como um pregão em tempo real.
- **Ticker** no topo: leads novos do dia rolando (estilo letreiro de cotações), com setor/RA e preço.
- **Painel por etapa** (colunas tipo book de ofertas): triagem → matrícula solicitada → recebida → dedup → ônus → proprietário identificado → contato no card. Contagem + idade média em cada etapa, com alerta visual (vermelho) p/ lead parado >N dias.
- **Índices**: leads/dia por portal, taxa de conversão etapa-a-etapa, custo acumulado em certidões vs leads completos ("custo por lead"), tempo médio anúncio→contato.
- Dados: Supabase (status já existem nas tabelas); realtime via polling 30s ou Supabase Realtime.
- Skill `frontend-design` p/ o visual; verde/vermelho de pregão, números grandes, monospace.

### Fase 5 — Novas APIs (enriquecimento e redução do trabalho humano)
| API | Uso no pipeline | Observação |
|-----|----------------|------------|
| **Mapillary** | Imagens street-level grátis embutidas NA triagem (ao lado dos candidatos do geoportal) — reduz o ida-e-volta ao Google Maps no único passo humano. | API key grátis; cobertura em Brasília é razoável nas vias principais. |
| **IBGE (CNEFE + setores censitários)** | CNEFE = cadastro nacional de endereços → mais uma fonte p/ validar/normalizar endereço; renda média do setor censitário → score de potencial do lead. | APIs públicas, sem auth. |
| **SIAGAS (CPRM)** | Poços tubulares cadastrados por coordenada — casa no Lago Sul com poço outorgado é sinal de padrão alto + dado p/ a ficha do imóvel. | Confirmado (jun/12): junto com o WFS da CPRM. |
| **WFS CPRM** | Serviço Geológico do Brasil (confirmado jun/12) — camadas geológicas/hidrogeológicas via GeoServer da CPRM, complementa SIAGAS no enriquecimento do lote. | `geoportal.cprm.gov.br` / GeoSGB. |

---

## Riscos / decisões em aberto
1. **Custo por certidão**: matrícula + ônus em volume "enorme" = conta relevante no cartório. O gate (aprovação humana → matrícula; dedup → ônus) é o controle de custo. Definir teto diário de solicitações no `rodarAuto2Oficio` (`limite` já existe).
2. **Cobertura de cartório**: só o 2º Ofício está automatizado. `lib/oficios.ts` mapeia regiões → ofícios; replicar o canal p/ os demais ofícios (cada um tem canal/formato próprio).
3. **dw_trk**: confirmar que o Davi tem como rodar um script agendado numa máquina da rede local (ponte da Fase 2 depende disso). ⚠️ GitHub Actions hospedado NÃO alcança 192.168.x — só runner self-hosted ou Tarefa do Windows local.
4. ~~Ônus por e-mail~~ **RESOLVIDO** (jun/12): pedido de ônus é form Pipefy → automação via API/Actions (Fase 3.1).
5. ~~"WFS CDRM"~~ **RESOLVIDO** (jun/12): é CPRM.
6. **LGPD**: CPF + contato de terceiros circulando por Pipefy/GChat/Supabase — manter acesso restrito, não logar CPF completo no GChat.

## Ordem de execução sugerida
**Fase 0 → 1 → 2 → 3** é o caminho do dinheiro (cada fase destrava a seguinte no fluxo). **Fase 4 (dashboard)** pode rodar em paralelo a qualquer momento — é leitura. **Fase 5** por último, exceto Mapillary, que é pequeno e melhora o passo humano desde já.
