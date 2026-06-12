# Mapa de Jornadas — ERP TRK / Velvet

> Referência para o time de desenvolvimento. Cada jornada tem: quem é a persona, o que ela tenta fazer, os passos atuais (com atrito) e os passos-alvo (depois da transformação UX).

---

## P1 — Captador de Campo

**Perfil:** corretor que sai para visitar imóveis na rua. Usa celular, uma mão ocupada, conexão instável.  
**Papel no sistema:** `captador`  
**Objetivo:** sair com lista clara, chegar no endereço certo, registrar resultado da visita, voltar para a próxima.

### Jornada atual (com atritos)

| Passo | O que faz | Tela | Atrito |
|-------|-----------|------|--------|
| 1 | Abre o app para ver visitas do dia | `/visitas` | **Mobile não existe** — layout desktop com mapa Leaflet, inutilizável em celular |
| 2 | Tenta entender quais visitas são suas | `/visitas` | Sem filtro por usuário; todas as visitas de todos aparecem |
| 3 | Tenta navegar até o endereço | `/visitas` | Link para o maps existe (`maps_link`) mas não tem botão de destaque; perdido entre dados |
| 4 | Registra o resultado da visita | `/visitas` → ação | Não tem UI de registro de resultado; depende de fluxo em outra tela |
| 5 | Volta para próxima visita | — | Sem agrupamento por prédio/região; sem ordem por proximidade na rota |

### Jornada-alvo (após transformação)

| Passo | O que faz | Tela-alvo | Critério de aceite |
|-------|-----------|-----------|-------------------|
| 1 | Abre app no celular → bottom nav "Visitas" | `/visitas` em 375px | Renderiza sem scroll horizontal; cards empilhados |
| 2 | Vê "Minhas visitas de hoje" agrupadas por prédio/região | `/visitas` | Apenas visitas atribuídas ao usuário logado (RLS); ordem por rota (nearest-neighbor já existe em `visitas-client.tsx`) |
| 3 | Toca "Navegar" → Google Maps | botão no card | Deep link `https://maps.google.com/?q={lat},{lng}` ou `geo:` abre em ≤1 toque |
| 4 | Registra resultado em ≤3 toques | sheet de baixo | Opções: captado / dono ausente / recusou / reagendar + campo de nota; mutation com offline-tolerance via localStorage |
| 5 | Avança para próxima visita | card seguinte | Badge "N restantes hoje" decrementado |

**Arquivos principais:** `app/(app)/visitas/visitas-client.tsx`, `app/(app)/visitas/visitas-loader.tsx`

---

## P2 — Operador de Mesa (Triagem/Back-office)

**Perfil:** faz triagem dos portais, enriquece dados, despacha para visita ou cartório. Desktop, sessões longas, trabalha por volume.  
**Papel no sistema:** `operador`  
**Objetivo:** processar a fila de imóveis pendentes com o máximo de agilidade — decidir rápido, enriquecer quando vale a pena, despachar.

### Jornada atual (com atritos)

| Passo | O que faz | Tela | Atrito |
|-------|-----------|------|--------|
| 1 | Abre o sistema → vai para triagem | `/triagem` | **Sem empty state** — tela branca quando fila está vazia |
| 2 | Vê fila de imóveis pendentes | `/triagem` | Funciona bem: filtros por tipo, região, portal, busca ao vivo |
| 3 | Abre ReviewPanel de um imóvel | `/triagem` → panel lateral | Panel tem "Aprovar", "Visitar", "Descartar" — fluxo existe |
| 4 | Busca matrícula/geoportal | ReviewPanel | Candidatos do Geoportal já aparecem no panel — bom |
| 5 | Busca dono (CPF/CNPJ) | `/busca-pessoa` | **Troca de tela** — perde o contexto do imóvel; não está integrado ao ReviewPanel |
| 6 | Envia para cartório (ônus) | ReviewPanel | **Sem modal de confirmação** — risco de envio acidental; regra do projeto requer confirmação explícita |
| 7 | Descarta imóvel | ReviewPanel → "Descartar" | Sem confirmação; sem "desfazer" |
| 8 | Filtros não sobrevivem ao F5 | `/triagem` | URL já usa `?q=` para busca, mas aba/filtros de tipo/região/portal são perdidos |

### Jornada-alvo

| Passo | O que faz | Tela-alvo | Critério de aceite |
|-------|-----------|-----------|-------------------|
| 1 | Abre o sistema → cai no Dashboard | `/dashboard` | Card "X imóveis pendentes na triagem" com CTA → `/triagem` |
| 2 | Abre triagem | `/triagem` | **Empty state** quando fila vazia: ícone + "Nenhum imóvel na fila — rodar coleta" |
| 3 | Aplica filtros | `/triagem?tipo=Apartamento&regiao=Lago+Sul` | Todos os filtros na URL; F5 mantém estado |
| 4 | Descarta imóvel | ReviewPanel | Modal de confirmação; toast com "Desfazer" por 5s |
| 5 | Envia para cartório | ReviewPanel | Modal com resumo do payload (endereço, matrícula, portal) + botão "Confirmar envio" |
| 6 | Visita imóvel | ReviewPanel → "Visitar" | Cria visita agrupada ao prédio se endereço aproximado bate (regra do projeto) |

**Arquivos principais:** `app/(app)/triagem/triagem-client.tsx`, `app/(app)/triagem/matricula-modal.tsx`

---

## P3 — Gestor

**Perfil:** olha o sistema 1–2x por dia, quer saber se a captação está funcionando. Desktop.  
**Papel no sistema:** `gestor`  
**Objetivo:** responder "o que está travado?" em ≤10 segundos e cobrar ação.

### Jornada atual (com atritos)

| Passo | O que faz | Tela | Atrito |
|-------|-----------|------|--------|
| 1 | Abre o sistema → Dashboard | `/dashboard` | Dashboard tem funil e alertas — dados corretos |
| 2 | Vê funil de captação | `/dashboard` | Funil existe com pendentes/para_visitar/visitados/aprovados/solicitados/recebidos |
| 3 | Tenta entender tendência | `/dashboard` | Gráfico de coletas por portal — não mostra taxa de conversão |
| 4 | Quer ver quem está produzindo mais | `/analitico/funil` | **Sem ranking por captador** — dados agregados, sem corte por usuário |
| 5 | Quer drill-down num número | Dashboard → qualquer card | **Cards do funil não são clicáveis** — não leva à lista filtrada |
| 6 | Precisa ver histórico de visitas | `/visitas` | Mostra todas as visitas — sem filtro por período ou por captador |

### Jornada-alvo

| Passo | O que faz | Tela-alvo | Critério de aceite |
|-------|-----------|-----------|-------------------|
| 1 | Abre app → Dashboard por papel | `/dashboard` | Visão de gestor: funil compacto (6 etapas) + variação semanal + gargalo destacado em roxo |
| 2 | Identifica gargalo | Dashboard | Etapa com maior queda é destacada automaticamente (`text-primary`) |
| 3 | Drill-down no gargalo | Dashboard → card clicável | Todo número leva à lista já filtrada (e.g.: `/triagem?status=pendente`) |
| 4 | Vê tendência | Dashboard | Variação semanal como delta numérico ("+12% vs semana passada") |
| 5 | Vê ranking de captadores | `/analitico/funil` | Tabela com visitas e captações por usuário (requer profiles + RLS) |

**Arquivos principais:** `app/(app)/dashboard/page.tsx`, `app/(app)/dashboard/dashboard-client.tsx`, `app/(app)/analitico/funil/page.tsx`

---

## Mapa de dependências

```
RLS + profiles (Fase 1)
  → captador só vê suas visitas (P1.2)
  → dashboard por papel (P3)
  → ranking por captador (P3.5)

URL state nos filtros (Fase 3)
  → P2.8 (filtros sobrevivem ao F5)
  → drill-down do dashboard (P3.3)

Mobile responsive (Fase 4)
  → P1 inteiro (a jornada de campo só existe com mobile)
```
