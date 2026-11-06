import { Router, type Request } from 'express'
import { z } from 'zod'
import { userId } from '../../core/middleware/auth.js'
import { noStore } from '../../core/middleware/cache.js'
import { defineRoute } from '../../core/route.js'
import { IdempotencyHeaders, langId, lessonId, localDay, note, phraseKey, word } from '../../core/schemas.js'
import { deviceOf, sendMutation, tzOf } from '../progress/me.helpers.js'
import { TestPayload } from '../sync/ops.js'
import { applySingle } from '../sync/sync.service.js'
import type { SyncOp } from '../sync/ops.js'

const tags = ['Learner actions']
const keyParams = z.object({ key: phraseKey })
const DayBody = z.object({ localDay: localDay.optional() }).strict()

type DirectOp = {
  [T in SyncOp['type']]: { type: T; payload: Extract<SyncOp, { type: T }>['payload'] }
}[SyncOp['type']]

/** Each direct endpoint is a single sync op under the hood; `Idempotency-Key` becomes the opId. */
async function run(req: Request, op: DirectOp, localDayValue?: string) {
  const key = req.get('idempotency-key')
  const r = await applySingle(userId(req), deviceOf(req), await tzOf(req), {
    ...op,
    ...(key ? { opId: key } : {}),
    ...(localDayValue ? { localDay: localDayValue } : {}),
  } as Parameters<typeof applySingle>[3])
  return {
    ...(r.result as Record<string, unknown>),
    ...(r.status === 'duplicate' ? { duplicate: true } : {}),
  }
}

export function phrasebookRouter(): Router {
  const r = Router()
  r.use('/me', noStore)
  const common = { tags, headers: IdempotencyHeaders }

  defineRoute(
    r,
    {
      ...common,
      method: 'post',
      path: '/me/phrases/:key/heard',
      summary: 'Mark a phrase as heard (+2 XP the first time)',
      params: keyParams,
      body: DayBody,
    },
    async (req, res, { params, body }) =>
      sendMutation(
        req,
        res,
        await run(req, { type: 'phrase.heard', payload: { key: params.key } }, body.localDay),
      ),
  )

  defineRoute(
    r,
    {
      ...common,
      method: 'post',
      path: '/me/phrases/:key/speak',
      summary: 'Record a pronunciation attempt (+5 XP when score ≥ 0.7)',
      params: keyParams,
      body: z.object({ score: z.number().min(0).max(1), localDay: localDay.optional() }).strict(),
    },
    async (req, res, { params, body }) =>
      sendMutation(
        req,
        res,
        await run(
          req,
          { type: 'phrase.speak', payload: { key: params.key, score: body.score } },
          body.localDay,
        ),
      ),
  )

  defineRoute(
    r,
    {
      ...common,
      method: 'put',
      path: '/me/phrases/:key/note',
      summary: 'Set a note (empty deletes)',
      params: keyParams,
      body: z.object({ note }).strict(),
    },
    async (req, res, { params, body }) =>
      sendMutation(
        req,
        res,
        await run(req, { type: 'phrase.note', payload: { key: params.key, note: body.note } }),
      ),
  )

  for (const [method, value] of [
    ['put', true],
    ['delete', false],
  ] as const) {
    defineRoute(
      r,
      {
        ...common,
        method,
        path: '/me/phrases/:key/favorite',
        summary: value ? 'Favourite a phrase' : 'Unfavourite a phrase',
        params: keyParams,
      },
      async (req, res, { params }) =>
        sendMutation(
          req,
          res,
          await run(req, { type: 'phrase.favorite', payload: { key: params.key, value } }),
        ),
    )
    defineRoute(
      r,
      {
        ...common,
        method,
        path: '/me/words/:langId/:word/favorite',
        summary: value ? 'Favourite a word' : 'Unfavourite a word',
        params: z.object({ langId, word }),
      },
      async (req, res, { params }) =>
        sendMutation(
          req,
          res,
          await run(req, {
            type: 'word.favorite',
            payload: { langId: params.langId, word: params.word, value },
          }),
        ),
    )
    defineRoute(
      r,
      {
        ...common,
        method,
        path: '/me/lessons/:lessonId/complete',
        summary: value ? 'Complete a career lesson (+50 XP)' : 'Un-complete a career lesson (−50 XP)',
        params: z.object({ lessonId }),
        body: DayBody,
      },
      async (req, res, { params, body }) =>
        sendMutation(
          req,
          res,
          await run(
            req,
            { type: 'lesson.complete', payload: { lessonId: params.lessonId, value } },
            body.localDay,
          ),
        ),
    )
    defineRoute(
      r,
      {
        ...common,
        method,
        path: '/me/bookmarks/:lessonId',
        summary: value ? 'Bookmark a lesson' : 'Remove a bookmark',
        params: z.object({ lessonId }),
      },
      async (req, res, { params }) =>
        sendMutation(
          req,
          res,
          await run(req, { type: 'lesson.bookmark', payload: { lessonId: params.lessonId, value } }),
        ),
    )
  }

  defineRoute(
    r,
    {
      ...common,
      method: 'post',
      path: '/me/tests',
      summary: 'Record a finished test (stars, review queue, XP)',
      body: TestPayload.extend({ localDay: localDay.optional() }).strict(),
    },
    async (req, res, { body }) => {
      const { localDay: day, ...payload } = body
      sendMutation(req, res, await run(req, { type: 'test.recorded', payload }, day))
    },
  )

  defineRoute(
    r,
    {
      ...common,
      method: 'post',
      path: '/me/review/add',
      summary: 'Add phrases to the review queue (box 0, due today)',
      body: z.object({ keys: z.array(phraseKey).min(1).max(100), localDay: localDay.optional() }).strict(),
    },
    async (req, res, { body }) =>
      sendMutation(
        req,
        res,
        await run(req, { type: 'review.add', payload: { keys: body.keys } }, body.localDay),
      ),
  )

  defineRoute(
    r,
    {
      ...common,
      method: 'post',
      path: '/me/review/:key/answer',
      summary: 'Answer a review card (Leitner move, +5 XP on knewIt)',
      params: keyParams,
      body: z.object({ knewIt: z.boolean(), localDay: localDay.optional() }).strict(),
    },
    async (req, res, { params, body }) =>
      sendMutation(
        req,
        res,
        await run(
          req,
          { type: 'review.answer', payload: { key: params.key, knewIt: body.knewIt } },
          body.localDay,
        ),
      ),
  )

  defineRoute(
    r,
    {
      ...common,
      method: 'post',
      path: '/me/practice',
      summary: 'Practice quiz result (+10 XP per correct)',
      body: z
        .object({
          correct: z.number().int().min(0),
          total: z.number().int().min(1).max(20),
          localDay: localDay.optional(),
        })
        .strict()
        .refine((b) => b.correct <= b.total, { message: 'correct cannot exceed total', path: ['correct'] }),
    },
    async (req, res, { body }) =>
      sendMutation(
        req,
        res,
        await run(
          req,
          { type: 'practice.answered', payload: { correct: body.correct, total: body.total } },
          body.localDay,
        ),
      ),
  )

  defineRoute(
    r,
    {
      ...common,
      method: 'post',
      path: '/me/languages/:langId/visit',
      summary: 'Record a language visit (recent list)',
      params: z.object({ langId }),
    },
    async (req, res, { params }) =>
      sendMutation(req, res, await run(req, { type: 'language.visit', payload: { langId: params.langId } })),
  )

  return r
}
