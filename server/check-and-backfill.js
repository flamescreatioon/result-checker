require('dotenv').config()

const path = require('path')
const pool = require('./src/config/db')
const { ensureSchema, importCsvFile } = require('./src/services/csvImportService')

const countMissingFor300Level = async () => {
  const query = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sem.current_gpa IS NULL)::int AS missing_current_gpa,
      COUNT(*) FILTER (WHERE sem.cumulative_gpa IS NULL)::int AS missing_cumulative_gpa
    FROM semester_results sem
    JOIN result_sheets rs ON rs.id = sem.result_sheet_id
    WHERE rs.level = '300 LEVEL';
  `

  const { rows } = await pool.query(query)
  return rows[0]
}

const run = async () => {
  try {
    await ensureSchema()

    const before = await countMissingFor300Level()
    console.log('Before backfill:', before)

    if (before.missing_current_gpa === 0 && before.missing_cumulative_gpa === 0) {
      console.log('300-level GPA is already complete. Skipping import.')
      return
    }

    const imports = [
      {
        filePath: path.resolve(__dirname, '..', 'json', '300level.csv'),
        sourceFileName: '300level.csv',
        options: { level: '300 LEVEL', semesterName: 'FIRST' },
      },
      {
        filePath: path.resolve(__dirname, '..', 'json', '300level2.csv'),
        sourceFileName: '300level2.csv',
        options: { level: '300 LEVEL', semesterName: 'SECOND' },
      },
    ]

    for (const item of imports) {
      console.log(`Importing ${item.sourceFileName}...`)
      const result = await importCsvFile(item.filePath, item.sourceFileName, item.options)
      console.log(`Imported ${item.sourceFileName}:`, {
        imported: result.imported,
        level: result.metadata?.level,
        semesterName: result.metadata?.semesterName,
      })
    }

    const after = await countMissingFor300Level()
    console.log('After backfill:', after)
  } finally {
    await pool.end()
  }
}

run().catch((error) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
