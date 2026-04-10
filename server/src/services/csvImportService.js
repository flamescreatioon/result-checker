const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const pool = require('../config/db')

const asInt = (value) => {
  const parsed = Number.parseInt(String(value || '').trim(), 10)
  return Number.isNaN(parsed) ? null : parsed
}

const asFloat = (value) => {
  const parsed = Number.parseFloat(String(value || '').trim())
  return Number.isNaN(parsed) ? null : parsed
}

const normalizeHeader = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()

const findHeaderIndex = (headers, keys) => {
  const normalizedKeys = keys.map((key) => normalizeHeader(key))
  return headers.findIndex((header) => normalizedKeys.includes(normalizeHeader(header)))
}

const normalizeLevelInput = (value) => {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) {
    return null
  }

  const compact = raw.replace(/\s+/g, '')
  const match = compact.match(/^(\d{3})(?:LEVEL)?$/)
  if (match) {
    return `${match[1]} LEVEL`
  }

  return raw
}

const normalizeSemesterInput = (value) => {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) {
    return null
  }

  const compact = raw.replace(/\s+/g, '')
  if (['1', '1ST', 'FIRST', 'SEM1', 'SEMESTER1'].includes(compact)) {
    return 'FIRST'
  }

  if (['2', '2ND', 'SECOND', 'SEM2', 'SEMESTER2'].includes(compact)) {
    return 'SECOND'
  }

  return raw
}

const extractMetadata = (rows) => {
  const metadata = {
    institution: null,
    college: null,
    department: null,
    sessionYear: 'Unknown',
    semesterName: 'Unknown',
    level: 'Unknown',
  }

  if (rows.length > 0) {
    metadata.institution = String(rows[0][0] || '').trim() || null
  }

  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      const cell = String(row[i] || '').trim().toUpperCase()
      if (cell === 'COLLEGE:') metadata.college = String(row[i + 1] || '').trim() || metadata.college
      if (cell === 'DEPARTMENT:') metadata.department = String(row[i + 1] || '').trim() || metadata.department
      if (cell === 'SESSION:') metadata.sessionYear = String(row[i + 1] || '').trim() || metadata.sessionYear
      if (cell === 'SEMESTER:') metadata.semesterName = String(row[i + 1] || '').trim() || metadata.semesterName
      if (cell === 'LEVEL:') metadata.level = String(row[i + 1] || '').trim() || metadata.level
    }
  }

  return metadata
}

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      reg_no TEXT NOT NULL UNIQUE,
      full_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS result_sheets (
      id SERIAL PRIMARY KEY,
      source_file TEXT NOT NULL,
      institution TEXT,
      college TEXT,
      department TEXT,
      session_year TEXT NOT NULL,
      semester_name TEXT NOT NULL,
      level TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source_file, session_year, semester_name, level)
    );

    CREATE TABLE IF NOT EXISTS semester_results (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      result_sheet_id INTEGER NOT NULL REFERENCES result_sheets(id) ON DELETE CASCADE,
      serial_no INTEGER,
      carry_over_courses TEXT,
      current_srt TEXT,
      current_tcl INTEGER,
      current_gp NUMERIC(8,2),
      current_gpa NUMERIC(5,2),
      previous_tcl INTEGER,
      previous_gp NUMERIC(8,2),
      previous_gpa NUMERIC(5,2),
      cumulative_tcl INTEGER,
      cumulative_gp NUMERIC(8,2),
      cumulative_gpa NUMERIC(5,2),
      remarks TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (student_id, result_sheet_id)
    );

    CREATE TABLE IF NOT EXISTS course_results (
      id SERIAL PRIMARY KEY,
      semester_result_id INTEGER NOT NULL REFERENCES semester_results(id) ON DELETE CASCADE,
      course_code TEXT NOT NULL,
      grade TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (semester_result_id, course_code)
    );

    CREATE INDEX IF NOT EXISTS idx_students_reg_no ON students(reg_no);
    CREATE INDEX IF NOT EXISTS idx_semester_results_student_id ON semester_results(student_id);
    CREATE INDEX IF NOT EXISTS idx_course_results_semester_result_id ON course_results(semester_result_id);
  `)
}

const importCsvRows = async (rows, sourceName, options = {}) => {
  const headerRowIndex = rows.findIndex((row) => String(row[0] || '').trim().toUpperCase() === 'S/N')

  if (headerRowIndex < 0) {
    return { imported: 0, sourceFile: sourceName, warning: 'Header row (S/N) not found' }
  }

  const metadata = extractMetadata(rows.slice(0, headerRowIndex))

  const explicitLevel = normalizeLevelInput(options.level)
  const explicitSemester = normalizeSemesterInput(options.semesterName)

  if (explicitLevel) {
    metadata.level = explicitLevel
  }

  if (explicitSemester) {
    metadata.semesterName = explicitSemester
  }

  // No filename fallback: semester/level must come from admin input or CSV metadata.
  
  const headers = rows[headerRowIndex]

  const nameIndex = findHeaderIndex(headers, ['NAME'])
  const regNoIndex = findHeaderIndex(headers, ['REG. NO./Code', 'REG. NO./CODE', 'REG NO'])
  const carryOverIndex = findHeaderIndex(headers, ['CARRY OVER COURSES'])
  const currentTclIndex = findHeaderIndex(headers, ['CURRENT TCL', 'CUR TCL', 'CUR_TCL'])
  const currentGpIndex = findHeaderIndex(headers, ['CURRENT GP', 'CUR GP', 'CUR_GP'])
  const currentGpaIndex = findHeaderIndex(headers, ['CURRENT GPA', 'CUR GPA', 'CUR_GPA'])
  const currentSrtIndex = findHeaderIndex(headers, ['CURRENT SRT', 'CUR SRT', 'CUR_SRT'])
  const previousTclIndex = findHeaderIndex(headers, ['PREVIOUS TCL', 'PREV TCL', 'PREV_TCL'])
  const previousGpIndex = findHeaderIndex(headers, ['PREVIOUS GP', 'PREV GP', 'PREV_GP'])
  const previousGpaIndex = findHeaderIndex(headers, ['PREVIOUS GPA', 'PREV GPA', 'PREV_GPA'])
  const cumulativeTclIndex = findHeaderIndex(headers, ['CUMULATIVE TCL', 'CUM TCL', 'CUM_TCL'])
  const cumulativeGpIndex = findHeaderIndex(headers, ['CUMULATIVE GP', 'CUM GP', 'CUM_GP'])
  const cumulativeGpaIndex = findHeaderIndex(headers, ['CUMULATIVE GPA', 'CUM GPA', 'CUM_GPA'])
  const remarksIndex = findHeaderIndex(headers, ['REMARKS'])

  const courseEndIndex = carryOverIndex >= 0 ? carryOverIndex : currentTclIndex
  const courseColumns = []

  for (let idx = regNoIndex + 1; idx < courseEndIndex; idx += 1) {
    const courseCode = String(headers[idx] || '').trim().replace(/\s+/g, ' ')
    if (courseCode) {
      courseColumns.push({ idx, courseCode })
    }
  }

  const sheetInsert = await pool.query(
    `
      INSERT INTO result_sheets (
        source_file,
        institution,
        college,
        department,
        session_year,
        semester_name,
        level
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (source_file, session_year, semester_name, level)
      DO UPDATE SET
        institution = EXCLUDED.institution,
        college = EXCLUDED.college,
        department = EXCLUDED.department
      RETURNING id;
    `,
    [
      sourceName,
      metadata.institution,
      metadata.college,
      metadata.department,
      metadata.sessionYear,
      metadata.semesterName,
      metadata.level,
    ]
  )

  const resultSheetId = sheetInsert.rows[0].id
  let imported = 0

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i]
    const serial = String(row[0] || '').trim()

    if (!serial || !/^\d+$/.test(serial)) {
      continue
    }

    const regNo = String(row[regNoIndex] || '').trim().toUpperCase()
    if (!regNo) {
      continue
    }

    const fullName = String(row[nameIndex] || '').trim() || null

    // Summary metrics are always the trailing columns, but some rows are short/shifted.
    // Reading from the tail keeps CUR/PREV/CUM GPA fields aligned.
    const tailStart = row.length >= 12 ? row.length - 12 : null
    const tailValue = (offset) => {
      if (tailStart === null) {
        return null
      }
      return row[tailStart + offset]
    }

    const carryOverRaw = tailStart === null
      ? (carryOverIndex >= 0 ? row[carryOverIndex] : null)
      : tailValue(0)
    const currentSrtRaw = tailStart === null
      ? (currentSrtIndex >= 0 ? row[currentSrtIndex] : null)
      : tailValue(4)
    const remarksRaw = tailStart === null
      ? (remarksIndex >= 0 ? row[remarksIndex] : null)
      : tailValue(11)
    const remarks = String(remarksRaw || '').trim() || null

    const studentInsert = await pool.query(
      `
        INSERT INTO students (reg_no, full_name)
        VALUES ($1, $2)
        ON CONFLICT (reg_no)
        DO UPDATE SET
          full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), students.full_name),
          updated_at = NOW()
        RETURNING id;
      `,
      [regNo, fullName]
    )

    const studentId = studentInsert.rows[0].id

    const semesterInsert = await pool.query(
      `
        INSERT INTO semester_results (
          student_id,
          result_sheet_id,
          serial_no,
          carry_over_courses,
          current_srt,
          current_tcl,
          current_gp,
          current_gpa,
          previous_tcl,
          previous_gp,
          previous_gpa,
          cumulative_tcl,
          cumulative_gp,
          cumulative_gpa,
          remarks
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15
        )
        ON CONFLICT (student_id, result_sheet_id)
        DO UPDATE SET
          serial_no = EXCLUDED.serial_no,
          carry_over_courses = EXCLUDED.carry_over_courses,
          current_srt = EXCLUDED.current_srt,
          current_tcl = EXCLUDED.current_tcl,
          current_gp = EXCLUDED.current_gp,
          current_gpa = EXCLUDED.current_gpa,
          previous_tcl = EXCLUDED.previous_tcl,
          previous_gp = EXCLUDED.previous_gp,
          previous_gpa = EXCLUDED.previous_gpa,
          cumulative_tcl = EXCLUDED.cumulative_tcl,
          cumulative_gp = EXCLUDED.cumulative_gp,
          cumulative_gpa = EXCLUDED.cumulative_gpa,
          remarks = EXCLUDED.remarks,
          updated_at = NOW()
        RETURNING id;
      `,
      [
        studentId,
        resultSheetId,
        asInt(serial),
        String(carryOverRaw || '').trim() || null,
        String(currentSrtRaw || '').trim() || null,
        asInt(tailStart === null ? row[currentTclIndex] : tailValue(1)),
        asFloat(tailStart === null ? row[currentGpIndex] : tailValue(2)),
        asFloat(tailStart === null ? row[currentGpaIndex] : tailValue(3)),
        asInt(tailStart === null ? row[previousTclIndex] : tailValue(5)),
        asFloat(tailStart === null ? row[previousGpIndex] : tailValue(6)),
        asFloat(tailStart === null ? row[previousGpaIndex] : tailValue(7)),
        asInt(tailStart === null ? row[cumulativeTclIndex] : tailValue(8)),
        asFloat(tailStart === null ? row[cumulativeGpIndex] : tailValue(9)),
        asFloat(tailStart === null ? row[cumulativeGpaIndex] : tailValue(10)),
        remarks,
      ]
    )

    const semesterResultId = semesterInsert.rows[0].id

    for (const { idx, courseCode } of courseColumns) {
      const gradeValue = String(row[idx] || '').trim()
      await pool.query(
        `
          INSERT INTO course_results (semester_result_id, course_code, grade)
          VALUES ($1, $2, $3)
          ON CONFLICT (semester_result_id, course_code)
          DO UPDATE SET
            grade = EXCLUDED.grade,
            updated_at = NOW();
        `,
        [semesterResultId, courseCode, gradeValue || null]
      )
    }

    imported += 1
  }

  return { imported, sourceFile: sourceName, metadata }
}

const importCsvContent = async (csvContent, sourceFileName = 'upload.csv', options = {}) => {
  const raw = String(csvContent || '')
  const rows = parse(raw, { relax_column_count: true, skip_empty_lines: false })
  return importCsvRows(rows, sourceFileName, options)
}

const importCsvFile = async (filePath, sourceFileName, options = {}) => {
  const sourceName = sourceFileName || path.basename(filePath)
  const raw = fs.readFileSync(filePath, 'utf8')
  return importCsvContent(raw, sourceName, options)
}

const importCsvDirectory = async (directoryPath) => {
  const files = fs
    .readdirSync(directoryPath)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .map((name) => path.join(directoryPath, name))

  if (!files.length) {
    return { files: 0, imported: 0, results: [] }
  }

  let imported = 0
  const results = []

  for (const file of files) {
    const result = await importCsvFile(file)
    imported += result.imported
    results.push(result)
  }

  return { files: files.length, imported, results }
}

module.exports = {
  ensureSchema,
  importCsvContent,
  importCsvFile,
  importCsvDirectory,
}
