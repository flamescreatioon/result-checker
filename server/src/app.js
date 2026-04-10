const express = require('express')
const cors = require('cors')

const resultRoutes = require('./routes/results')
const adminRoutes = require('./routes/admin')

const app = express()

app.use(cors())
app.use(express.json())
app.use('/api', resultRoutes)
app.use('/api/admin', adminRoutes)

app.get('/', (req, res) => {
  res.json({
    message: 'Result checker API is running',
  })
})

module.exports = app
