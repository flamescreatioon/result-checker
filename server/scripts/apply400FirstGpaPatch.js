require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const pool = require('../src/config/db')

const FILE_NAME = '400level.csv'
const CSV_PATH = path.resolve(__dirname, '../../json', FILE_NAME)
const MAX_ATTEMPTS = 8

const readCsvRows = () => {
  const raw = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parse(raw, { relax_column_count: true, skip_empty_lines: false })
  const header = rows[0].map((value) => String(value || '').trim().toUpperCase())

  const index = {
    serial: header.indexOf('S/N'),
    regNo: header.indexOf('REG. NO./CODE'),
    curGp: header.indexOf('CUR GP'),
    curGpa: header.indexOf('CUR GPA'),
    cumGp: header.indexOf('CUM GP'),
    cumGpa: header.indexOf('CUM GPA'),
  }

  if (Object.values(index).some((v) => v < 0)) {
    throw new Error('400level.csv does not contain required GPA headers.')
  }

  const cleaned = []
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    const serial = String(row[index.serial] || '').trim()
    if (!/^\d+$/.test(serial)) {
      continue
    }

    const regNo = String(row[index.regNo] || '').trim().toUpperCase()
    if (!regNo) {
      continue
    }

    const tailStart = row.length >= 12 ? row.length - 12 : null
    const tailValue = (offset) => {
      if (tailStart === null) {
        return null
      }
      return row[tailStart + offset]
    }

    const toNumberOrNull = (value) => {
      const rawValue = String(value || '').trim()
      if (!rawValue) {
        return null
      }
      const parsed = Number.parseFloat(rawValue)
      return Number.isNaN(parsed) ? null : parsed
    }

    cleaned.push({
      regNo,
      currentGp: toNumberOrNull(tailStart === null ? row[index.curGp] : tailValue(2)),
      currentGpa: toNumberOrNull(tailStart === null ? row[index.curGpa] : tailValue(3)),
      cumulativeGp: toNumberOrNull(tailStart === null ? row[index.cumGp] : tailValue(9)),
      cumulativeGpa: toNumberOrNull(tailStart === null ? row[index.cumGpa] : tailValue(10)),
    })
  }

  return cleaned
}

const getMissingStats = async () => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sr.current_gpa IS NULL)::int AS missing_current_gpa,
      COUNT(*) FILTER (WHERE sr.cumulative_gpa IS NULL)::int AS missing_cumulative_gpa
    FROM semester_results sr
    JOIN result_sheets rs ON rs.id = sr.result_sheet_id
    WHERE rs.source_file = '400level.csv'
      AND rs.level = '400 LEVEL'
      AND UPPER(rs.semester_name) = 'FIRST'
  `)

  return rows[0]
}

const isTransient = (error) => {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  return (
    ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(code) ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection timeout')
  )
}

const applyUpdates = async (rows) => {
  for (const item of rows) {
    await pool.query(
      `
        UPDATE semester_results sr
        SET
          current_gp = COALESCE($1, sr.current_gp),
          current_gpa = COALESCE($2, sr.current_gpa),
          cumulative_gp = COALESCE($3, sr.cumulative_gp),
          cumulative_gpa = COALESCE($4, sr.cumulative_gpa),
          updated_at = NOW()
        FROM students s, result_sheets rs
        WHERE sr.student_id = s.id
          AND rs.id = sr.result_sheet_id
          AND s.reg_no = $5
          AND rs.source_file = '400level.csv'
          AND rs.level = '400 LEVEL'
          AND UPPER(rs.semester_name) = 'FIRST'
      `,
      [item.currentGp, item.currentGpa, item.cumulativeGp, item.cumulativeGpa, item.regNo]
    )
  }
}

const main = async () => {
  const rows = readCsvRows()
  console.log('CSV rows prepared:', rows.length)

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        console.log(`Applying GPA patch attempt ${attempt}/${MAX_ATTEMPTS}...`)
        await applyUpdates(rows)
        const stats = await getMissingStats()
        console.log('Current DB stats:', stats)

        if (Number(stats.missing_current_gpa) === 0 && Number(stats.missing_cumulative_gpa) <= 18) {
          console.log('400 FIRST GPA patch completed.')
          return
        }
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message)
        if (!isTransient(error) || attempt === MAX_ATTEMPTS) {
          throw error
        }
      }
    }

    throw new Error('Patch attempts exhausted before completion.')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('400 FIRST GPA patch failed:', error.message)
  process.exit(1)
})
