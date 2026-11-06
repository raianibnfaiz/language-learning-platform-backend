/**
 * Tiny migrate-mongo style runner: `npm run migrate:up` applies pending files in src/db/migrations
 * (sorted by name) and records them in the `migrations` collection; `migrate:down` reverts the last one.
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import type { Db } from 'mongodb'
import { connectDb, disconnectDb } from '../config/db.js'

interface Migration {
  description?: string
  up(db: Db): Promise<void>
  down(db: Db): Promise<void>
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

async function listMigrations(): Promise<string[]> {
  return (await readdir(dir)).filter((f) => /^\d{4}-.+\.(ts|js)$/.test(f) && !f.endsWith('.d.ts')).sort()
}

export async function migrateUp(db: Db): Promise<string[]> {
  const done = new Set((await db.collection('migrations').find().toArray()).map((m) => m.name as string))
  const applied: string[] = []
  for (const file of await listMigrations()) {
    const name = file.replace(/\.(ts|js)$/, '')
    if (done.has(name)) continue
    const m = (await import(pathToFileURL(path.join(dir, file)).href)) as Migration
    await m.up(db)
    await db.collection('migrations').insertOne({ name, appliedAt: new Date() })
    applied.push(name)
  }
  return applied
}

export async function migrateDown(db: Db): Promise<string | null> {
  const last = await db.collection('migrations').find().sort({ appliedAt: -1, name: -1 }).limit(1).next()
  if (!last) return null
  const file = (await listMigrations()).find((f) => f.replace(/\.(ts|js)$/, '') === last.name)
  if (!file) throw new Error(`migration file for ${String(last.name)} not found`)
  const m = (await import(pathToFileURL(path.join(dir, file)).href)) as Migration
  await m.down(db)
  await db.collection('migrations').deleteOne({ _id: last._id })
  return last.name as string
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const cmd = process.argv[2]
  try {
    await connectDb()
    const db = mongoose.connection.db!
    if (cmd === 'up') console.log('applied:', (await migrateUp(db)).join(', ') || 'nothing pending')
    else if (cmd === 'down') console.log('reverted:', (await migrateDown(db)) ?? 'nothing')
    else throw new Error('usage: migrate.ts up|down')
    await disconnectDb()
  } catch (err) {
    console.error(err)
    await disconnectDb().catch(() => undefined)
    process.exit(1)
  }
}
