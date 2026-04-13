const serverless = require('serverless-http')
const app = require('../server/src/app')

module.exports = serverless(app, {
	callbackWaitsForEmptyEventLoop: false,
})