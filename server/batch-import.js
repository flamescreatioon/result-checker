/**
 * Batch import all CSV files with filename-based level/semester detection
 */

require('dotenv').config()

const path = require('path');
const { importCsvFile } = require('./src/services/csvImportService');
const pool = require('./src/config/db');

const csvDir = path.join(__dirname, '../json');

const csvFiles = [
  '100level2.csv',
  '200level.csv',
  '200level2.csv',
  '300level.csv',
  '300level2.csv',
  '400level.csv',
  '400level2.csv',
];

async function batchImportCsvs() {
  console.log('Starting batch import of CSV files...\n');

  for (const filename of csvFiles) {
    const filepath = path.join(csvDir, filename);
    console.log(`Importing: ${filename}...`);

    try {
      const result = await importCsvFile(filepath);
      console.log(
        `  ✓ Successfully imported ${filename}`
      );
      console.log(
        `    - Students: ${result.students}, Semesters: ${result.semesters}, Courses: ${result.courses}`
      );
      console.log(`    - Level: ${result.metadata.level}, Semester: ${result.metadata.semester}\n`);
    } catch (error) {
      console.error(`  ✗ Error importing ${filename}:`);
      console.error(`    ${error.message}`);
      console.error(`    ${error.stack}\n`);
    }
  }

  console.log('Batch import complete!');
  await pool.end();
}

batchImportCsvs().catch(error => {
  console.error('Batch import failed:', error);
  process.exit(1);
});
