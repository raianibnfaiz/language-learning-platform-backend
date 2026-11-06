// Generating the document needs no database or real secrets: fill placeholders before the app loads.
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/openapi'
process.env.JWT_ACCESS_SECRET ??= 'openapi-generation-placeholder-secret-0000'
process.env.LOG_LEVEL = 'silent'
process.env.NODE_ENV = 'test'

const { writeFile } = await import('node:fs/promises')
const { openapiDocument } = await import('../app.js')
await writeFile('openapi.json', JSON.stringify(openapiDocument(), null, 2) + '\n')
console.log('wrote openapi.json')
