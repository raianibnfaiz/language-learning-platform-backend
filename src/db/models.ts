/** Every Mongoose model, imported once so indexes/migrations can iterate over them. */
import {
  CareerLanguageModel,
  ContentMetaModel,
  LanguageModel,
  PhraseModel,
  SituationModel,
} from '../modules/content/content.model.js'
import { AuditLogModel, DeviceModel, EmailTokenModel, UserModel } from '../modules/users/user.model.js'
import { SessionModel } from '../modules/auth/session.model.js'
import { DailyActivityModel, LearnerStateModel } from '../modules/progress/progress.model.js'
import {
  FavoriteWordModel,
  PhraseStateModel,
  TestScoreModel,
  TombstoneModel,
} from '../modules/phrasebook/phrasebook.model.js'
import { ImportRecordModel, SyncOpModel } from '../modules/sync/sync.model.js'
import { TranslationModel, TranslationUsageModel } from '../modules/translation/translation.model.js'
import { RateLimitModel } from '../core/middleware/rateLimitStore.model.js'

export const allModels = [
  LanguageModel,
  SituationModel,
  PhraseModel,
  CareerLanguageModel,
  ContentMetaModel,
  UserModel,
  DeviceModel,
  EmailTokenModel,
  AuditLogModel,
  SessionModel,
  LearnerStateModel,
  DailyActivityModel,
  PhraseStateModel,
  TestScoreModel,
  FavoriteWordModel,
  TombstoneModel,
  SyncOpModel,
  ImportRecordModel,
  TranslationModel,
  TranslationUsageModel,
  RateLimitModel,
]
