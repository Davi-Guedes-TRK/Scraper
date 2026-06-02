# Plano Completo — Organização das Entradas de Lead (Captação)

> Objetivo: toda origem de lead vira uma **entrada** sob a categoria **Captação**, todas
> convergindo pro mesmo downstream. Origem fica **carimbada** (enum) pra o BI enxergar as 8.

## 1. Princípio
**Captação = todas as origens de lead, uma entrada cada.** O que muda por origem é (a) **de onde vêm os dados** e (b) **em que etapa do pipe ela entra** (organograma). Daí pra frente o caminho é único:

```
[entrada] → carimba ORIGEM → Triagem (endereço + checagem Nido: já existe? aproveita ônus/contato)
         → Cartório / "SEC | Ônus" (matrícula+ônus, Playwright+sessão, sem API)
         → Pipefy → Funil/BI (conversão por origem)
```

## 2. Arquitetura atual (o que já existe)
- **Nav** (grupos): Dashboard · Analítico(Funil) · **Captação**(Alvos, Scrapers, Lançamentos) · Triagem(Fila, Extração de Pistas, Referências Visuais, Identificar Imóvel) · Campo(Visitas) · Documentos(Cartório).
- **Dados:** Supabase (`imoveis_*` por portal → view `imoveis_todos`; `captacao_targets`; `pipefy_captacoes`) + **Nido**/dw_trk (`nido_*`, réplica do CRM).
- **Pipefy sem API:** Playwright + `credentials/pipefy_session.json`; form **"SEC | Ônus"** (10 campos; os 2 NIDO ficam manuais).
- **Cartório/Região:** Região = coluna `cidade` (RA: `lago-sul`→"Lago Sul"); cartório derivado do bairro via `oficios.txt` (1º–4º Ofício + Outro).
- **Constraints:** quota **Gemini é mínima** (não depender dele em volume → usar Geoportal/GPS/Nido/Tesseract). Upsert dos scrapers **não mexe em `status_triagem`** (descarte persiste).

## 3. As 8 entradas

| # | Entrada | O que é | Fonte / como puxa | Entra no pipe em | Status |
|---|---|---|---|---|---|
| 1 | **Portais** | anúncios de portal | scrapers olx/df/wimoveis/zap/viva/chaves/fb → `imoveis_todos` | Início (IB1) | ✅ existe (`/triagem`, rótulo→"Portais") |
| 2 | **Lançamentos** | prédios em lançamento | `*_sync.py` (riva/elar/direcional/greenhouse/lotus/p.octávio) | Matrícula (IB7) | ✅ existe (`/lancamentos`) |
| 3 | **Captura em Campo** | foto da placa de aluguel na rua (FSBO, dono direto) | celular: foto + **GPS → Geoportal** (endereço) + dedup Nido; telefone digitado/Tesseract (**sem Gemini**) | Início (IB1) | 🔴 novo (`/captura`) |
| 4 | **Campanhas** | leads de campanha junto ao MKT | form / import CSV | Início (IB1) | 🔴 novo (`/campanhas`) |
| 5 | **Em Captação (concorrente)** | em captação p/ aluguel por **outro corretor, FAC aberto** | inteligência: Nido FAC aberto não-TRK / portal c/ CRECI | Negociação (N1) | 🔴 novo (`/concorrencia`) |
| 6 | **Alugamos, não Administramos** | TRK alugou mas o dono não deixou administrar | **Nido `Inativo` + `Negociado` = 1.586 imóveis** | Negociação (N1) | 🟡 refoca o `/captacao` (Alvos) |
| 7 | **Carteira Paralela (investidores)** | vender p/ donos multi-imóvel que já administramos → vira novo aluguel nosso | Nido: proprietários da carteira c/ perfil investidor | Investidor (I1→I4) | 🔴 novo (`/carteira-paralela`) |
| 8 | **Em Venda → provável aluguel** | imóvel em processo de venda; dono provavelmente vai alugar | mapear: venda nos portais / Nido `disponivel_venda` | Início (IB1) | 🔴 novo (`/em-venda`) |

**Decisões embutidas:**
- **"Win-back" genérico sai** (chefe: pouco retorno) → vira **#6 Alugamos não Administramos** (direcionado, pool real de 1.586). O motor `sync_captacao.py`/`captacao_targets` se refoca em `situacao_detalhe='Negociado'`.
- **Carteira Paralela = ramo "Investidores"** do organograma (oferecer imóveis à venda → comprou → novo imóvel alocado com TRK).
- **Intermediados sem ADM (O4):** muito parecido com **#5 Em Captação (concorrente)** → **proposta: fundir em #5** (sub-tipo). Reabrir só se você quiser separado.
- **Remarketing** não é entrada — é hub de re-entrada (volta pra Qualificação após gatilho: X dias / desocupação / reajuste).

## 4. A espinha + taxonomia de origem
**Taxonomia (enum fixo)** — substitui o "adivinhar pelo `links_anuncio`":
`portal · lancamento · captura_campo · campanha · em_captacao · alugamos_nao_adm · carteira_paralela · em_venda`

**Banco (faseado):**
- **Fase 1:** coluna `origem` (text/enum) nas tabelas que já guardam lead (`imoveis_*`) + carimbar (scraper de portal='portal', lançamento='lancamento'). Barato.
- **Quando entrar a 1ª entrada não-portal:** tabela canônica `captacao_leads` (a espinha) com os 9 campos mínimos (Endereço, Matrícula, Nome, Telefone, Bairro, Tipo, Valor, Metragem, **Origem**) + ref de proveniência (link do anúncio / `codigo_imovel` Nido) + `pipefy_card_id`. As fontes existentes (`imoveis_todos`, `captacao_targets`) passam a alimentar a espinha sem quebrar o que roda.

## 5. Nav reorganizado (proposto)
```
Captação            ← ENTRADAS
  Portais · Lançamentos · Captura em Campo · Campanhas
  · Em Captação · Alugamos não Adm. · Carteira Paralela · Em Venda
Processamento       ← FERRAMENTAS (não são entradas)
  Extração de Pistas · Referências Visuais · Identificar Imóvel · Scrapers
Campo               Visitas
Documentos          Cartório (SEC | Ônus)
Analítico           Funil de Captação
```
**Rotas:** renomear **só rótulos**; manter URLs existentes (badge/markSeen/links de e-mail dependem de `/triagem`). Rotas novas só pras entradas novas.

## 6. Conserto do BI
`/api/pipefy/funil` hoje deriva origem com `ILIKE links_anuncio` (só vê portais). Trocar pelo **enum `origem`** → conversão real por origem (oportunidades→leads→visitas→captações por entrada).

## 7. Plano faseado
- **Fase 1 — Reorg + taxonomia** *(barato, alto impacto)*: rótulo "Portais", nav agrupado, coluna `origem` + carimbo, funil lê `origem`. *(toca nav + 1 coluna + 1 query do funil)*
- **Fase 2 — Captura em Campo** *(alto valor, sem Gemini)*: página mobile foto+GPS → Geoportal → dedup Nido → lead. Telefone manual/Tesseract.
- **Fase 3 — Entradas manuais (Campanhas, Em Venda)**: form/import → espinha, com origem e passo de pipe certo.
- **Fase 4 — Nido-driven (#6 Alugamos não Adm., #7 Carteira Paralela, #5 Em Captação)**: refoca `captacao_targets` em `Negociado`; query de investidores; FAC aberto não-TRK.
- **Fase 5 — Espinha canônica + automação de card** (se/quando consolidar tudo num lugar só).

⚠️ Toca **banco/Pipefy** (precisa do seu OK): coluna `origem`, tabela `captacao_leads`, criação de card. Resto é código.

## 8. Pendências
1. Confirmar **fundir Intermediados em "Em Captação"** (ou manter separado).
2. Ofício de **Park Way / Park Sul** (não estão na `oficios.txt` → hoje caem em "Outro").
3. Começar pela **Fase 1**?
