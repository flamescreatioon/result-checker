const dotenv = require('dotenv')
const serverless = require('serverless-http')
const app = require('../server/src/app')

dotenv.config()

module.exports = serverless(app, {
  callbackWaitsForEmptyEventLoop: false,
})