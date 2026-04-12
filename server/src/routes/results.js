const express = require('express')
const pool = require('../config/db')

const router = express.Router()

const sortSemester = (value) => {
  const normalized = (value || '').toUpperCase()
  if (normalized.includes('FIRST')) return 1
  if (normalized.includes('SECOND')) return 2
  return 3
}

router.get('/health', async (req, res) => {
  try {
    const hasDbUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT
    if (!hasDbUrl) {
      return res.status(503).json({
        ok: false,
        api: 'up',
        dbConfigured: false,
        message: 'DATABASE_URL or DATABASE_URL_DIRECT is not configured in Vercel environment variables',
      })
    }

    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timed out after 4 seconds')), 4000)),
    ])
    return res.json({ ok: true, api: 'up', dbConfigured: true, dbReachable: true })
  } catch (error) {
    return res.status(500).json({ ok: false, api: 'up', dbConfigured: true, dbReachable: false, message: error.message || 'Database connection failed' })
  }
})

router.get('/results/:regNo', async (req, res) => {
  try {
    const hasDbUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT
    if (!hasDbUrl) {
      return res.status(503).json({ message: 'DATABASE_URL or DATABASE_URL_DIRECT is not configured in Vercel environment variables' })
    }

    const regNo = String(req.params.regNo || '').trim().toUpperCase()

    if (!regNo) {
      return res.status(400).json({ message: 'Registration number is required' })
    }

    const query = `
      SELECT
        s.reg_no,
        s.full_name,
        rs.session_year,
        rs.semester_name,
        rs.level,
        sem.current_gpa,
        sem.cumulative_gpa,
        sem.remarks,
        sem.current_gp,
        sem.cumulative_gp,
        sem.current_tcl,
        sem.cumulative_tcl,
        sem.current_srt,
        sem.carry_over_courses,
        sem.id AS semester_result_id
      FROM semester_results sem
      JOIN students s ON s.id = sem.student_id
      JOIN result_sheets rs ON rs.id = sem.result_sheet_id
      WHERE s.reg_no = $1
    `

    const { rows } = await pool.query(query, [regNo])

    if (!rows.length) {
      return res.status(404).json({ message: 'No result found for that registration number' })
    }

    const semesterIds = rows.map((row) => row.semester_result_id)

    const { rows: courseRows } = await pool.query(
      `
        SELECT semester_result_id, course_code, grade
        FROM course_results
        WHERE semester_result_id = ANY($1::int[])
      `,
      [semesterIds]
    )

    const courseMap = new Map()
    for (const course of courseRows) {
      if (!courseMap.has(course.semester_result_id)) {
        courseMap.set(course.semester_result_id, [])
      }
      courseMap.get(course.semester_result_id).push({
        courseCode: course.course_code,
        grade: course.grade,
      })
    }

    const semesters = rows
      .map((row) => ({
        regNo: row.reg_no,
        fullName: row.full_name,
        sessionYear: row.session_year,
        semesterName: row.semester_name,
        level: row.level,
        currentGpa: row.current_gpa,
        cumulativeGpa: row.cumulative_gpa,
        currentGp: row.current_gp,
        cumulativeGp: row.cumulative_gp,
        currentTcl: row.current_tcl,
        cumulativeTcl: row.cumulative_tcl,
        currentSrt: row.current_srt,
        carryOverCourses: row.carry_over_courses,
        remarks: row.remarks,
        courses: courseMap.get(row.semester_result_id) || [],
      }))
      .sort((a, b) => {
        if (a.sessionYear !== b.sessionYear) {
          return a.sessionYear.localeCompare(b.sessionYear)
        }
        return sortSemester(a.semesterName) - sortSemester(b.semesterName)
      })

    const latest = semesters[semesters.length - 1]

    return res.json({
      student: {
        regNo: latest.regNo,
        fullName: latest.fullName,
      },
      summary: {
        currentGpa: latest.currentGpa,
        cumulativeGpa: latest.cumulativeGpa,
        currentGp: latest.currentGp,
        cumulativeGp: latest.cumulativeGp,
        currentTcl: latest.currentTcl,
        cumulativeTcl: latest.cumulativeTcl,
        totalSemesters: semesters.length,
      },
      semesters,
    })
  } catch (error) {
    return res.status(500).json({ message: 'Could not fetch results', error: error.message })
  }
})

module.exports = router
