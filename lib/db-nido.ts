import postgres from 'postgres'

// Banco separado do Nido (réplica ETL do CRM da corretora).
// Requer variável NIDO_DATABASE_URL no Vercel e no .env.local.
const sqlNido = postgres(process.env.NIDO_DATABASE_URL!)

export default sqlNido
