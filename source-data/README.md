# source-data

Copy these four files from the web app here, **unchanged**:

| File | What the seed reads from it |
|---|---|
| `catalog.ts` | the 54-language catalog array (`{ id, name, nativeName, flag, speechCode, region, latin, featured?, community? }`) |
| `phrases.ts` | `situations`, `core`, `coreRomanization`, `travel`, `travelRomanization` |
| `languages.ts` | the 5 ranked career languages with their 6 lessons each |
| `helpBot.ts` | not seeded (Pip stays on the clients); kept here for the phase-2 server-side port |

Then run `npm run seed`. The seed finds exports by name first and by shape second, and fails with a
clear message (listing the exports it saw) if something does not line up. It asserts
54 languages, 7 situations, 773 phrases, 5 career languages and 30 lessons.

`test/fixtures/source-data/` holds a 3-language sample in the same format, used by the tests.
