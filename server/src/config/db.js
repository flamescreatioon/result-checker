const { Pool } = require('pg')

const toDirectNeonHost = (value) => {
  const raw = String(value || '')
  if (!raw.includes('-pooler.')) {
    return raw
  }

  return raw.replace('-pooler.', '.')
}

const connectionString = process.env.DATABASE_URL_DIRECT || toDirectNeonHost(process.env.DATABASE_URL)

const pool = new Pool({
  connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 15000),
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 30000),
})

module.exports = pool
