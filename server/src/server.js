const dotenv = require('dotenv')

dotenv.config()
const app = require('./app')
const port = Number(process.env.PORT) || 5000

app.listen(port, () => {
  console.log(`API listening on port ${port}`)
})
