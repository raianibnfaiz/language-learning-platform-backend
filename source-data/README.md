# source-data

These are the web app's content files, copied here **unchanged** (from `src/data/` and `src/data/phrasebook/`):

| File | What the seed reads from it |
|---|---|
| `catalog.ts` | the 54-language catalog array (`{ id, name, nativeName, flag, speechCode, region, latin, featured?, community? }`) |
| `phrases.ts` | `situations`, `coreSituationIds` and the web's own `phrasesFor()` |
| `languages.ts` | the 5 ranked career languages with their 6 lessons each |
| `tests.ts` | reference for `src/modules/content/tests.meta.ts` |
| `helpBot.ts` | not seeded (Pip stays on the clients); kept here for the phase-2 server-side port |

To update content, copy the changed files again and run `npm run seed`. The seed finds exports by name first and by shape second, and fails with a
clear message (listing the exports it saw) if something does not line up. It asserts
54 languages, 7 situations, 773 phrases, 5 career languages and 30 lessons.

`test/fixtures/source-data/` holds a 3-language sample in the same format, used by the tests.
