import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function withCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get<T>(key)
    if (cached !== null) return cached
  } catch (err) {
    import('@/lib/logger').then(({ log }) =>
      log('warn', 'redis', 'Cache indisponível — operando sem cache', {
        key, erro: err instanceof Error ? err.message : String(err),
      })
    ).catch(() => {})
  }
  const fresh = await fn()
  try {
    await redis.set(key, fresh, { ex: ttlSeconds })
  } catch { /* falha silenciosa — dado retornado mesmo sem cache */ }
  return fresh
}

export async function invalidateCache(...keys: string[]) {
  try {
    await Promise.all(keys.map(k => redis.del(k)))
  } catch { /* ignora */ }
}
