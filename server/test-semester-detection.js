/**
 * Test the filename parsing logic
 */

const path = require('path');

const extractLevelAndSemesterFromFilename = (filename) => {
  const basename = path.basename(filename, '.csv').toLowerCase()

  // Match patterns like "100level", "200level2", etc.
  const match = basename.match(/^(\d{3})level(\d)?(.*)$/)

  if (!match) {
    return null
  }

  const levelCode = match[1] // e.g., "100", "200", "300", "400"
  const semesterIndicator = match[2] || '1' // e.g., "1" (no suffix), "2"

  const levelMap = {
    '100': '100 LEVEL',
    '200': '200 LEVEL',
    '300': '300 LEVEL',
    '400': '400 LEVEL',
  }

  const semesterMap = {
    '1': 'FIRST',
    '2': 'SECOND',
  }

  return {
    level: levelMap[levelCode] || `${levelCode} LEVEL`,
    semester: semesterMap[semesterIndicator] || `SEMESTER ${semesterIndicator}`,
  }
}

// Test cases
const testFiles = [
  '100level.csv',
  '100level2.csv',
  '200level.csv',
  '200level2.csv',
  '300level.csv',
  '300level2.csv',
  '400level.csv',
  '400level2.csv',
]

console.log('Testing filename parsing for semester detection:\n')

testFiles.forEach(filename => {
  const result = extractLevelAndSemesterFromFilename(filename)
  if (result) {
    console.log(`${filename} → Level: ${result.level}, Semester: ${result.semester}`)
  } else {
    console.log(`${filename} → Could not parse`)
  }
})

console.log('\n✓ All tests completed!')
