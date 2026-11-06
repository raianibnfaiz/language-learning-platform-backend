import { MongoMemoryReplSet } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}

let replSet: MongoMemoryReplSet | undefined

/** One in-memory replica set (transactions need one) for the whole run; each test file uses its own DB. */
export async function setup(project: TestProject) {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    ...(process.env.MONGOMS_SYSTEM_BINARY
      ? { binary: { systemBinary: process.env.MONGOMS_SYSTEM_BINARY } }
      : {}),
  })
  project.provide('mongoUri', replSet.getUri())
}

export async function teardown() {
  await replSet?.stop()
}
