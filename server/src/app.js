const express = require('express')
const cors = require('cors')

const resultRoutes = require('./routes/results')
const adminRoutes = require('./routes/admin')

const app = express()

const allowedOrigins = String(
  process.env.FRONTEND_ORIGIN || process.env.FRONTEND_ORIGINS || ''
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-password'],
}

app.use(cors(corsOptions))
app.use(express.json())

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  return next()
})

app.use('/api', resultRoutes)
app.use('/api/admin', adminRoutes)

app.get('/', (req, res) => {
  res.json({
    message: 'Result checker API is running',
  })
})

module.exports = app
