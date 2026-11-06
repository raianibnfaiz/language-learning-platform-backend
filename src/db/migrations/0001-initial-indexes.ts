import type { Db } from 'mongodb'
import { allModels } from '../models.js'

export const description = 'Create every collection and the indexes declared in §3'

export async function up(_db: Db): Promise<void> {
  for (const model of allModels) {
    await model.createCollection().catch((err: { codeName?: string }) => {
      if (err.codeName !== 'NamespaceExists') throw err
    })
    await model.createIndexes()
  }
}

export async function down(db: Db): Promise<void> {
  for (const model of allModels) {
    const exists = await db.listCollections({ name: model.collection.collectionName }).hasNext()
    if (exists) await db.collection(model.collection.collectionName).dropIndexes()
  }
}
