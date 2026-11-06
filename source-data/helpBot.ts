import { normalize } from '../lib/text'
import { catalog, type CatalogLanguage } from './phrasebook/catalog'
import { situationsFor } from './phrasebook/phrases'

export interface BotLink {
  label: string
  to: string
}

export interface BotReply {
  /** Text with **bold** markers and line breaks */
  text: string
  links?: BotLink[]
  /** Suggested follow-up questions shown as chips */
  suggestions?: string[]
}

/** What the bot knows about the learner right now, for personal answers */
export interface BotContext {
  due: number
  heard: number
  xp: number
  level: number
  streak: number
  recentLanguage?: CatalogLanguage
}

interface Intent {
  id: string
  /** Words or phrases that point to this topic. Multi-word phrases score higher. */
  keys: string[]
  reply: (ctx: BotContext) => BotReply
}

export const starterQuestions = [
  'How do I get started?',
  'How many languages are there?',
  'How do the tests work?',
  'How do I make a report?',
]

const n = catalog.length

const intents: Intent[] = [
  {
    id: 'greeting',
    keys: ['hi', 'hello', 'hey', 'hola', 'bonjour', 'good morning', 'good evening', 'salam', 'yo'],
    reply: () => ({
      text: "Hi there! 👋 I'm **Pip**, your LinguaWealth guide. Ask me anything about using the site, like how the tests work or how to save a phrase.",
      suggestions: starterQuestions,
    }),
  },
  {
    id: 'about',
    keys: ['what is this', 'what is linguawealth', 'about', 'this website', 'this site', 'what can i do', 'features', 'what does'],
    reply: () => ({
      text: `LinguaWealth helps you **speak real phrases** in ${n} languages.\n\n• **Phrasebook**: learn phrases by real-life situation (greetings, restaurant, taxi…)\n• **Four tests** per situation to earn stars and XP\n• **Review** brings back phrases you missed\n• **Reports** turn your learning into a PDF or spreadsheet\n• **Career languages**: in-depth courses for the 5 most valuable languages`,
      links: [{ label: 'Open the Phrasebook', to: '/phrasebook' }],
      suggestions: ['How do I get started?', 'What are career languages?'],
    }),
  },
  {
    id: 'start',
    keys: ['get started', 'start', 'begin', 'first time', 'new here', 'how to use', 'how do i use', 'beginner', 'tutorial', 'guide'],
    reply: () => ({
      text: "Easy, three steps:\n\n1. Open the **Phrasebook** and pick a language.\n2. Choose a situation, like **First words**, and press 🔊 to hear each phrase. Repeat it out loud!\n3. When you've heard them all, take the **tests** to earn stars and XP.\n\nCome back every day to grow your 🔥 streak.",
      links: [{ label: 'Pick a language', to: '/phrasebook' }],
      suggestions: ['How do the tests work?', 'How do I hear a phrase slowly?'],
    }),
  },
  {
    id: 'languages',
    keys: ['how many languages', 'which languages', 'languages available', 'list of languages', 'all languages', 'language list', 'supported', 'languages'],
    reply: () => ({
      text: `There are **${n} languages** to learn, from Albanian to Zulu. Every language has **First words** and **Getting by**. English, Spanish, French, Mandarin and German also have restaurant, taxi, hotel, shopping and directions.\n\nTip: type a language name here, like "Japanese", and I'll tell you what's in it.`,
      links: [{ label: `Browse all ${n}`, to: '/phrasebook' }],
      suggestions: ['How do I get started?', 'What are situations?'],
    }),
  },
  {
    id: 'situations',
    keys: ['situation', 'situations', 'topics', 'restaurant', 'taxi', 'hotel', 'shopping', 'directions', 'lesson', 'lessons', 'phrasebook'],
    reply: () => ({
      text: "Phrases are grouped into **situations**, so you learn what you'd actually say: 👋 First words, 🧭 Getting by, 🍝 Restaurant, 🚕 Taxi, 🏨 Hotel, 🛍️ Shopping and 🗺️ Directions.\n\nEach situation has a **Learn** step (listen and repeat) and **four tests**.",
      links: [{ label: 'Open the Phrasebook', to: '/phrasebook' }],
      suggestions: ['How do the tests work?', 'Why is a situation locked?'],
    }),
  },
  {
    id: 'locked',
    keys: ['locked', 'coming soon', 'cant open', 'unlock', 'lock'],
    reply: () => ({
      text: "Two kinds of locks:\n\n• **Situations marked \"Coming soon\"** aren't written for that language yet. The travel situations are ready in English, Spanish, French, Mandarin and German.\n• **Tests with a 🔒** unlock when you earn at least **1 star** (half the answers right) in the test before.",
      suggestions: ['How do the tests work?'],
    }),
  },
  {
    id: 'listen',
    keys: ['listen', 'audio', 'hear', 'play', 'slow', 'slower', 'speed', 'play all', 'autoplay', 'sound'],
    reply: () => ({
      text: "In the phrase player:\n\n• 🔊 **Play** reads the phrase aloud\n• 🐢 **Slow** reads it at half speed, great for tricky sounds\n• **Play all** walks through every phrase in the situation\n\nYou can also press **space** to listen and **← →** to move between phrases.",
      suggestions: ['The pronunciation sounds wrong', 'Can I practise speaking?'],
    }),
  },
  {
    id: 'voice',
    keys: ['pronunciation', 'voice', 'accent', 'sounds wrong', 'robot', 'robotic', 'no audio', 'no sound', 'not working', 'wrong pronunciation', 'speaker'],
    reply: () => ({
      text: "Audio comes from the **voices installed on your device**. LinguaWealth picks the most natural one automatically.\n\nIf it sounds off:\n• Use the **Voice** menu under the phrase to try another voice\n• **Chrome or Edge** have clearer online voices than Safari or Firefox\n• Add a voice for that language in your system's speech settings\n\nSome regional languages (like Breton or Walloon) have no voice on most devices.",
      suggestions: ['How do I hear a phrase slowly?'],
    }),
  },
  {
    id: 'mic',
    keys: ['speak', 'speaking', 'microphone', 'mic', 'record', 'say it', 'talk', 'my pronunciation', 'check my'],
    reply: () => ({
      text: "Yes! Tap the 🎤 **mic** in the phrase player and say the phrase. Pip listens and shows a **% match**. Score 70% or more for bonus XP.\n\nThe mic works in Chrome, Edge and Safari. Allow microphone access when your browser asks.",
      suggestions: ['How do I earn XP?'],
    }),
  },
  {
    id: 'notes',
    keys: ['note', 'notes', 'memo', 'write'],
    reply: () => ({
      text: "Tap the 📝 **notes** button in the phrase player to write a memory trick or grammar tip for that phrase. Notes save automatically and appear in your **Phrase list** report.",
      links: [{ label: 'Reports', to: '/reports' }],
    }),
  },
  {
    id: 'tests',
    keys: ['test', 'tests', 'quiz', 'exam', 'stars', 'star', 'picture match', 'sharp ears', 'challenge'],
    reply: () => ({
      text: "Each situation has **four tests**, each a bit harder:\n\n1. 🖼️ **Picture match**: hear a phrase, tap its picture\n2. 👂 **Sharp ears**: hear a phrase, pick the written one\n3. 🧩 **Word builder**: put the words in order\n4. ✍️ **Fill the gap**: type (or spell with tiles) the missing word\n\nGet half right for ⭐, 70% for ⭐⭐, all right for ⭐⭐⭐. Three correct in a row gives a 🔥 combo bonus!",
      suggestions: ['What happens to answers I get wrong?', 'How do I earn XP?'],
    }),
  },
  {
    id: 'typing',
    keys: ['word builder', 'fill the gap', 'typing', 'type', 'tiles', 'spell', 'keyboard', 'accents', 'accent marks'],
    reply: () => ({
      text: "In **Fill the gap**, languages with the Latin alphabet ask you to **type** the missing word. Missing accents still count, and Pip shows the right spelling. For scripts like Thai, Arabic or Chinese, you **tap letter tiles** instead, so no special keyboard is needed.\n\nIn **Word builder**, tap the pieces in order. Tap a placed piece to take it back.",
    }),
  },
  {
    id: 'review',
    keys: ['review', 'missed', 'mistakes', 'wrong answers', 'get wrong', 'spaced', 'repetition', 'forget', 'revise', 'flashcard'],
    reply: (ctx) => ({
      text: `Any phrase you miss in a test goes into your **Review** queue. Review shows it again, then waits longer each time you remember it (1 day, 3 days, a week…) until it's mastered.\n\n${ctx.due ? `You have **${ctx.due}** phrase${ctx.due === 1 ? '' : 's'} to review right now!` : "Your review queue is clear right now. 🎉"}`,
      links: [{ label: 'Open Review', to: '/review' }],
    }),
  },
  {
    id: 'favorites',
    keys: ['favourite', 'favorite', 'favourites', 'favorites', 'save', 'saved', 'heart', 'like', 'word list', 'save a word'],
    reply: () => ({
      text: "In the phrase player:\n\n• Tap ❤ on the picture to **favourite a phrase**\n• Tap any ☆ **word chip** under the phrase to save that word\n\nSee them all in **Reports → Favourites**.",
      links: [{ label: 'Reports', to: '/reports' }],
    }),
  },
  {
    id: 'reports',
    keys: ['report', 'reports', 'pdf', 'csv', 'excel', 'print', 'export', 'download', 'spreadsheet'],
    reply: () => ({
      text: "Open **Reports**, choose a language (or all your languages), and pick:\n\n📜 Phrase list · 🔤 Word list · ❤️ Favourites · 📈 Learning progress\n\nThen tap **Print / save as PDF** or **Download CSV** to open it in Excel or Google Sheets.",
      links: [{ label: 'Make a report', to: '/reports' }],
    }),
  },
  {
    id: 'xp',
    keys: ['xp', 'points', 'level', 'levels', 'streak', 'daily goal', 'goal', 'reward', 'rewards', 'combo', 'earn'],
    reply: (ctx) => ({
      text: `You earn **XP** for:\n• Hearing a phrase for the first time (+2)\n• Correct test answers (+5 to +15, harder tests give more)\n• Combos of 3 in a row (+5 bonus)\n• Speaking a phrase well (+5) and remembering in Review (+5)\n\nXP raises your **level**, and practising every day grows your 🔥 **streak**. The daily goal is 50 XP.\n\nRight now you're **level ${ctx.level}** with **${ctx.xp} XP** and a **${ctx.streak}-day** streak.`,
      links: [{ label: 'Dashboard', to: '/' }],
    }),
  },
  {
    id: 'progress',
    keys: ['progress', 'dashboard', 'stats', 'statistics', 'achievements', 'history', 'how am i doing', 'track'],
    reply: (ctx) => ({
      text: `The **Dashboard** shows your languages, phrases heard and weekly XP. **Progress** has achievements and a 12-week activity calendar. For a full breakdown per language, make a **Learning progress** report.\n\nSo far you've heard **${ctx.heard}** phrase${ctx.heard === 1 ? '' : 's'}.`,
      links: [{ label: 'Dashboard', to: '/' }, { label: 'Progress', to: '/progress' }, { label: 'Reports', to: '/reports' }],
    }),
  },
  {
    id: 'career',
    keys: ['career languages', 'career', 'valuable', 'money', 'ranking', 'why these 5', 'business', 'job', 'course', 'courses', 'economic'],
    reply: () => ({
      text: "**Career languages** are the five languages ranked by economic value: English, Spanish, French, Mandarin and German. Each has a learning path of lessons you can tick off and bookmark, plus a value score breakdown.",
      links: [{ label: 'Career languages', to: '/languages' }, { label: 'Why these 5?', to: '/about' }],
    }),
  },
  {
    id: 'practice',
    keys: ['practice', 'practise', 'quick quiz', 'multiple choice'],
    reply: () => ({
      text: "The **Practice** page is a quick multiple-choice quiz for the five career languages. Each right answer gives 10 XP. For full listening and speaking practice, use the **Phrasebook** tests.",
      links: [{ label: 'Practice', to: '/practice' }, { label: 'Phrasebook', to: '/phrasebook' }],
    }),
  },
  {
    id: 'bookmarks',
    keys: ['bookmark', 'bookmarks'],
    reply: () => ({
      text: "Tap the 🔖 bookmark icon on any lesson in a career course to save it. Your saved lessons live on the **Bookmarks** page. To save phrases and words, use ❤ favourites in the Phrasebook.",
      links: [{ label: 'Bookmarks', to: '/bookmarks' }],
    }),
  },
  {
    id: 'theme',
    keys: ['dark mode', 'light mode', 'theme', 'dark', 'night mode', 'colors', 'colours'],
    reply: () => ({ text: "Tap the 🌙 / ☀️ button at the top right to switch between dark and light mode. Your choice is remembered." }),
  },
  {
    id: 'data',
    keys: ['account', 'login', 'sign up', 'register', 'password', 'saved where', 'my data', 'privacy', 'reset', 'lost progress', 'sync', 'another device'],
    reply: () => ({
      text: "No account needed. Your progress, favourites and notes are saved **in this browser** on this device. Clearing your browser data will reset them, and they don't sync to other devices yet. Tip: download a **report** to keep a copy.",
      links: [{ label: 'Reports', to: '/reports' }],
    }),
  },
  {
    id: 'mobile',
    keys: ['mobile', 'phone', 'tablet', 'app', 'ios', 'android', 'menu'],
    reply: () => ({
      text: "LinguaWealth works in your phone's browser. Tap ☰ at the top left to open the menu. For the best voices and the mic, use Chrome on Android or Safari on iPhone.",
    }),
  },
  {
    id: 'shortcuts',
    keys: ['shortcut', 'shortcuts', 'keys', 'hotkeys', 'arrow', 'space bar', 'enter'],
    reply: () => ({
      text: "Keyboard shortcuts:\n• **Space**: play the phrase\n• **← →**: previous / next phrase\n• **Enter**: continue after a test answer",
    }),
  },
  {
    id: 'thanks',
    keys: ['thanks', 'thank you', 'thx', 'great', 'awesome', 'cool', 'nice', 'perfect', 'ok', 'okay'],
    reply: () => ({ text: "You're welcome! Happy learning 🌱 Ask me anything else any time." }),
  },
  {
    id: 'bye',
    keys: ['bye', 'goodbye', 'see you', 'later', 'ciao'],
    reply: () => ({ text: 'See you soon! Keep that streak alive 🔥' }),
  },
  {
    id: 'next',
    keys: ['what next', 'what should i do', 'recommend', 'suggest', 'next step', 'today', 'bored'],
    reply: (ctx) => {
      if (ctx.due) return { text: `First, clear your **${ctx.due}** review phrase${ctx.due === 1 ? '' : 's'}. It only takes a minute and keeps them in your memory.`, links: [{ label: 'Start review', to: '/review' }] }
      if (ctx.recentLanguage) {
        return {
          text: `Keep going with **${ctx.recentLanguage.flag} ${ctx.recentLanguage.name}**. Try the next situation or go for ⭐⭐⭐ in a test you've already passed.`,
          links: [{ label: `Open ${ctx.recentLanguage.name}`, to: `/phrasebook/${ctx.recentLanguage.id}` }],
        }
      }
      return { text: 'Pick a language you love and start with **First words**. Six phrases, about five minutes. 🚀', links: [{ label: 'Pick a language', to: '/phrasebook' }] }
    },
  },
]

/** A language named in the message, e.g. "Do you have Japanese?" */
function findLanguage(message: string) {
  const text = ` ${normalize(message)} `
  const names = (l: CatalogLanguage) => [l.name, l.name.replace(/\s*\(.*\)/, ''), l.nativeName, l.id.replace('-', ' ')]
  return [...catalog]
    .sort((a, b) => b.name.length - a.name.length)
    .find((l) => names(l).some((name) => name.length > 2 && text.includes(` ${normalize(name)} `)))
}

function languageReply(lang: CatalogLanguage): BotReply {
  const sits = situationsFor(lang.id)
  const open = sits.filter((s) => s.available)
  return {
    text: `Yes! **${lang.flag} ${lang.name}** (${lang.nativeName}) is here with ${open.length} situation${open.length === 1 ? '' : 's'}: ${open.map((s) => `${s.emoji} ${s.title}`).join(', ')}.${
      lang.community ? '\n\n🌱 It is a regional language, so phrases are a best-effort starter set.' : ''
    }${open.length < sits.length ? `\n\nMore situations are coming soon.` : ''}`,
    links: [{ label: `Learn ${lang.name}`, to: `/phrasebook/${lang.id}` }],
    suggestions: ['How do I get started?', 'How do the tests work?'],
  }
}

/** Score each topic by matching key words and phrases. Longer phrase matches count more. */
export function answer(message: string, ctx: BotContext): BotReply {
  const text = ` ${normalize(message)} `
  const words = new Set(text.trim().split(' '))

  let best: { intent: Intent; score: number } | undefined
  for (const intent of intents) {
    let score = 0
    for (const key of intent.keys) {
      const k = normalize(key)
      if (k.includes(' ') ? text.includes(` ${k} `) : words.has(k)) score += k.split(' ').length * 2
      // Allow simple plurals and verb forms ("tests", "reviewing")
      else if (!k.includes(' ') && k.length > 3 && [...words].some((w) => w.startsWith(k))) score += 1
    }
    if (score > 0 && (!best || score > best.score)) best = { intent, score }
  }

  const lang = findLanguage(message)
  // A named language wins unless the question is clearly about a feature ("how do tests work in Spanish")
  if (lang && (!best || best.score <= 2 || best.intent.id === 'languages' || best.intent.id === 'greeting')) return languageReply(lang)
  if (best) return best.intent.reply(ctx)

  return {
    text: "Hmm, I'm not sure about that one. 🤔 I can help with using LinguaWealth, for example:",
    suggestions: ['How do I get started?', 'How do the tests work?', 'How does review work?', 'How do I make a report?', 'The pronunciation sounds wrong'],
  }
}
