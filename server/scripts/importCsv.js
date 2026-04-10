const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

dotenv.config()

const pool = require('../src/config/db')
const { ensureSchema, importCsvDirectory } = require('../src/services/csvImportService')

const jsonDir = path.resolve(__dirname, '../../json')

async function run() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is missing. Add it to server/.env first.')
    }

    if (!fs.existsSync(jsonDir)) {
      console.log('No CSV files found in /json.')
      return
    }

    await ensureSchema()
    const summary = await importCsvDirectory(jsonDir)

    for (const result of summary.results) {
      console.log(`${result.sourceFile}: imported ${result.imported} rows`)
    }

    console.log(`Done. Imported/updated ${summary.imported} rows in total.`)
  } catch (error) {
    console.error('Import failed:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

run()
