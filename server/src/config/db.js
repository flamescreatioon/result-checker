const { Pool } = require('pg')

const toDirectNeonHost = (value) => {
  const raw = String(value || '')
  if (!raw.includes('-pooler.')) {
    return raw
  }

  return raw.replace('-pooler.', '.')
}

const connectionString = process.env.DATABASE_URL_DIRECT || toDirectNeonHost(process.env.DATABASE_URL)

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
const poolMax = Number(process.env.PG_POOL_MAX || (isServerless ? 1 : 10))

const globalForPool = globalThis

if (!globalForPool.__resultCheckerPool) {
  globalForPool.__resultCheckerPool = new Pool({
    connectionString,
    ssl: connectionString ? { rejectUnauthorized: false } : false,
    max: poolMax,
    idleTimeoutMillis: isServerless ? 1000 : 10000,
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 15000),
    query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 30000),
    allowExitOnIdle: true,
  })
}

module.exports = globalForPool.__resultCheckerPool
