import mongoose, { type Schema } from 'mongoose'

const HIDDEN = ['__v', 'passwordHash', 'tokenHash']

/** toJSON: `_id` -> `id`, drop `__v`, password and token hashes. */
export function toJsonPlugin(schema: Schema): void {
  schema.set('toJSON', {
    virtuals: false,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      if (ret._id !== undefined) {
        ret.id = String(ret._id)
        delete ret._id
      }
      for (const k of HIDDEN) delete ret[k]
      return ret
    },
  })
}

/**
 * `sanitizeFilter` is on globally, so query operators written by *our* code must be marked trusted:
 * `{ due: trusted({ $lte: today }) }`. Client input is never passed through this.
 */
export const trusted = <T extends object>(op: T): T => mongoose.trusted(op) as T
