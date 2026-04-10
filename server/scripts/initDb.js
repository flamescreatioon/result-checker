const dotenv = require('dotenv')

dotenv.config()

const pool = require('../src/config/db')
const { ensureSchema } = require('../src/services/csvImportService')

async function initDb() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is missing. Add it to server/.env first.')
    }

    await ensureSchema()
    console.log('Database schema is ready.')
  } catch (error) {
    console.error('Failed to initialize database:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

initDb()
