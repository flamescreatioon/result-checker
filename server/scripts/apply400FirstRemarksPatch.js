require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const pool = require('../src/config/db')

const FILE_NAME = '400level.csv'
const CSV_PATH = path.resolve(__dirname, '../../json', FILE_NAME)
const MAX_ATTEMPTS = 6

const readRows = () => {
  const raw = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parse(raw, { relax_column_count: true, skip_empty_lines: false })
  const header = rows[0].map((v) => String(v || '').trim().toUpperCase())

  const serialIdx = header.indexOf('S/N')
  const regIdx = header.indexOf('REG. NO./CODE')
  const remarksIdx = header.indexOf('REMARKS')

  if (serialIdx < 0 || regIdx < 0 || remarksIdx < 0) {
    throw new Error('Required CSV headers not found for remarks patch.')
  }

  const parsed = []
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    const serial = String(row[serialIdx] || '').trim()
    if (!/^\d+$/.test(serial)) continue

    const regNo = String(row[regIdx] || '').trim().toUpperCase()
    if (!regNo) continue

    const tailStart = row.length >= 12 ? row.length - 12 : null
    const rawRemarks = tailStart === null ? row[remarksIdx] : row[tailStart + 11]
    const remarks = String(rawRemarks || '').trim() || null

    parsed.push({ regNo, remarks })
  }

  return parsed
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

const updateRemarks = async (items) => {
  for (const item of items) {
    await pool.query(
      `
        UPDATE semester_results sr
        SET remarks = $1, updated_at = NOW()
        FROM students s, result_sheets rs
        WHERE sr.student_id = s.id
          AND rs.id = sr.result_sheet_id
          AND s.reg_no = $2
          AND rs.source_file = '400level.csv'
          AND rs.level = '400 LEVEL'
          AND UPPER(rs.semester_name) = 'FIRST'
      `,
      [item.remarks, item.regNo]
    )
  }
}

const stats = async () => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sr.remarks IS NULL OR BTRIM(sr.remarks) = '')::int AS missing_remarks,
      COUNT(*) FILTER (WHERE UPPER(sr.remarks) = 'PASS')::int AS pass_count
    FROM semester_results sr
    JOIN result_sheets rs ON rs.id = sr.result_sheet_id
    WHERE rs.source_file = '400level.csv' AND rs.level = '400 LEVEL' AND UPPER(rs.semester_name) = 'FIRST'
  `)

  return rows[0]
}

const main = async () => {
  const items = readRows()
  console.log('Rows prepared:', items.length)

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        console.log(`Applying remarks patch attempt ${attempt}/${MAX_ATTEMPTS}...`)
        await updateRemarks(items)
        console.log('DB stats:', await stats())
        return
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message)
        if (!isTransient(error) || attempt === MAX_ATTEMPTS) {
          throw error
        }
      }
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Remarks patch failed:', error.message)
  process.exit(1)
})
