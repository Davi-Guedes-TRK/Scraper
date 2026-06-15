-- Passo 6: nível de risco geológico no lead, p/ sinalizar imóvel perigoso ANTES
-- da captação (badge ⚠️ no Pregão). Calculado no gate (lib/onus-gate.ts) quando o
-- imóvel tem lat/lng; fonte = cartas de suscetibilidade SGB/CPRM (lib/ficha-risco.ts).
ALTER TABLE onus_pipeline ADD COLUMN IF NOT EXISTS risco_nivel  text;  -- alto|medio|baixo|nenhum
ALTER TABLE onus_pipeline ADD COLUMN IF NOT EXISTS risco_resumo text;  -- "Inundação: Alta · Mov. de massa: Média"
