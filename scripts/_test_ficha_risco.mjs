// Descartável: testa a orquestração da ficha de risco direto no SGB (sem Redis).
import { sgbNoPonto } from '../lib/wfs-sgb.ts'

const pontos = [
  { nome: 'Plano Piloto centro', lat: -15.793, lng: -47.883 },
  { nome: 'Lago Sul QI 9',       lat: -15.8425, lng: -47.8675 },
  { nome: 'Sol Nascente (risco)', lat: -15.808, lng: -48.20 },
]
const camadas = [
  ['gestao-territorial:suscet_movimento_de_massa', 'Movimento de massa'],
  ['gestao-territorial:suscet_inundacao', 'Inundação'],
  ['gestao-territorial:suscet_enxurrada', 'Enxurrada'],
]
for (const p of pontos) {
  console.log(`\n── ${p.nome} (${p.lat},${p.lng}) ──`)
  for (const [tn, rot] of camadas) {
    try {
      const f = await sgbNoPonto(tn, p.lat, p.lng, ['classe'])
      console.log(`  ${rot}: ${f.length ? f.map(x => x.classe).join(', ') : '(sem feição)'}`)
    } catch (e) { console.log(`  ${rot}: ERRO ${e.message}`) }
  }
  try {
    const g = (await sgbNoPonto('geosgb:litoestratigrafia_1m', p.lat, p.lng, ['nome', 'ambiente_tectonico', 'idade_min', 'idade_max']))[0]
    console.log(`  Geologia: ${g ? `${g.nome} | ${g.ambiente_tectonico} | ${g.idade_min}–${g.idade_max}` : '(sem)'}`)
  } catch (e) { console.log(`  Geologia: ERRO ${e.message}`) }
}
