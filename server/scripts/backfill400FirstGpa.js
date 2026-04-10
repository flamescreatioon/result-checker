require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const pool = require('../src/config/db')
const { ensureSchema, importCsvFile } = require('../src/services/csvImportService')

const FILE_NAME = '400level.csv'
const csvPath = path.resolve(__dirname, '../../json', FILE_NAME)
const importOptions = { level: '400 LEVEL', semesterName: 'FIRST' }
const MAX_ATTEMPTS = 12

const expectedRowsFromCsv = () => {
  const raw = fs.readFileSync(csvPath, 'utf8')
  const rows = parse(raw, { relax_column_count: true, skip_empty_lines: false })
  const headerIndex = rows.findIndex((row) => String(row[0] || '').trim().toUpperCase() === 'S/N')
  if (headerIndex < 0) return 0

  let count = 0
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const serial = String(rows[i][0] || '').trim()
    if (/^\d+$/.test(serial)) count += 1
  }

  return count
}

const getStats = async () => {
  const { rows } = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE sr.current_gpa IS NULL)::int AS missing_current_gpa,
        COUNT(*) FILTER (WHERE sr.cumulative_gpa IS NULL)::int AS missing_cumulative_gpa
      FROM semester_results sr
      JOIN result_sheets rs ON rs.id = sr.result_sheet_id
      WHERE rs.source_file = $1
        AND rs.level = '400 LEVEL'
        AND UPPER(rs.semester_name) = 'FIRST'
    `,
    [FILE_NAME]
  )

  return rows[0]
}

const isNetworkError = (error) => {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  return (
    ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(code) ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection timeout') ||
    message.includes('connection terminated due to connection timeout')
  )
}

const main = async () => {
  try {
    await ensureSchema()

    const expected = expectedRowsFromCsv()
    console.log('Expected rows from CSV:', expected)

    let before = await getStats()
    console.log('Before backfill:', before)

    if (
      Number(before.total) >= expected &&
      Number(before.missing_current_gpa) === 0 &&
      Number(before.missing_cumulative_gpa) === 0
    ) {
      console.log('400 FIRST GPA already complete. No backfill needed.')
      return
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        console.log(`Importing ${FILE_NAME} attempt ${attempt}/${MAX_ATTEMPTS}...`)
        const result = await importCsvFile(csvPath, FILE_NAME, importOptions)
        console.log('Import result:', {
          imported: result.imported,
          level: result.metadata?.level,
          semesterName: result.metadata?.semesterName,
        })
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message)
        if (!isNetworkError(error) || attempt === MAX_ATTEMPTS) {
          throw error
        }
      }

      before = await getStats()
      console.log('Current stats:', before)

      if (
        Number(before.total) >= expected &&
        Number(before.missing_current_gpa) === 0 &&
        Number(before.missing_cumulative_gpa) === 0
      ) {
        console.log('400 FIRST GPA backfill complete.')
        return
      }
    }

    throw new Error('Backfill did not complete within max attempts.')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error.message)
  process.exit(1)
})
