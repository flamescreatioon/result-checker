/**
 * Check database status and student count
 */

require('dotenv').config()

const pool = require('./src/config/db')

async function checkDb() {
  try {
    console.log('Checking database status...\n')

    const studentCount = await pool.query('SELECT COUNT(*) as count FROM students')
    const sheetCount = await pool.query('SELECT COUNT(*) as count FROM result_sheets')
    const semesterCount = await pool.query('SELECT COUNT(*) as count FROM semester_results')
    const courseCount = await pool.query('SELECT COUNT(*) as count FROM course_results')

    console.log('Database stats:')
    console.log(`  Students: ${studentCount.rows[0].count}`)
    console.log(`  Result Sheets: ${sheetCount.rows[0].count}`)
    console.log(`  Semester Results: ${semesterCount.rows[0].count}`)
    console.log(`  Course Results: ${courseCount.rows[0].count}`)

    if (studentCount.rows[0].count > 0) {
      const sheets = await pool.query(
        'SELECT DISTINCT level, semester_name, COUNT(*) as count FROM result_sheets GROUP BY level, semester_name ORDER BY level, semester_name'
      )

      console.log('\nData by level and semester:')
      sheets.rows.forEach(row => {
        console.log(`  ${row.level} - ${row.semester_name}: ${row.count} sheets`)
      })
    }
  } catch (error) {
    console.error('Error checking database:', error.message)
  } finally {
    await pool.end()
  }
}

checkDb()
