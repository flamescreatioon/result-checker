const express = require('express')
const multer = require('multer')
const bcrypt = require('bcrypt')
const { ensureSchema, importCsvContent } = require('../services/csvImportService')

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isCsv = file.mimetype.includes('csv') || file.originalname.toLowerCase().endsWith('.csv')
    if (!isCsv) {
      return cb(new Error('Only CSV files are allowed'))
    }
    return cb(null, true)
  },
})

const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      return next()
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'CSV file is too large. Maximum size is 4MB.' })
    }

    return res.status(400).json({ message: error.message || 'Invalid upload request' })
  })
}

const requireAdminPassword = async (req, res, next) => {
  const expectedHash = process.env.ADMIN_PASSWORD_HASH

  if (!expectedHash) {
    return res.status(500).json({ message: 'ADMIN_PASSWORD_HASH is not configured' })
  }

  const provided = req.header('x-admin-password')
  if (!provided) {
    return res.status(401).json({ message: 'Admin password is required' })
  }

  try {
    const isValid = await bcrypt.compare(provided, expectedHash)
    if (!isValid) {
      return res.status(401).json({ message: 'Incorrect admin password' })
    }
    return next()
  } catch (error) {
    return res.status(500).json({ message: 'Password verification failed' })
  }
}

router.post('/upload-csv', requireAdminPassword, handleUpload, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ message: 'DATABASE_URL is not configured' })
    }

    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required in form-data field: file' })
    }

    const level = String(req.body.level || '').trim()
    const semesterName = String(req.body.semesterName || req.body.semester || '').trim()

    if (!level) {
      return res.status(400).json({ message: 'Level is required in form-data field: level' })
    }

    if (!semesterName) {
      return res.status(400).json({ message: 'Semester is required in form-data field: semesterName' })
    }

    await ensureSchema()
    const importResult = await importCsvContent(req.file.buffer.toString('utf8'), req.file.originalname, {
      level,
      semesterName,
    })

    return res.status(201).json({
      message: 'CSV uploaded and imported successfully',
      import: importResult,
    })
  } catch (error) {
    return res.status(500).json({ message: 'CSV upload/import failed', error: error.message })
  }
})

module.exports = router
