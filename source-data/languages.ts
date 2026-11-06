export type Level = 'Beginner' | 'Intermediate' | 'Advanced'

export interface Lesson {
  id: string
  title: string
  description: string
  level: Level
  minutes: number
}

export interface Phrase {
  text: string
  /** Pronunciation help, e.g. pinyin for Mandarin */
  romanization?: string
  meaning: string
}

/** Scores out of 100, used to compare economic value */
export interface ValueScores {
  gdpAccess: number
  tradeUtility: number
  diplomacy: number
  wagePremium: number
}

export interface Language {
  id: string
  rank: number
  name: string
  nativeName: string
  flag: string
  /** BCP 47 code used for text-to-speech */
  speechCode: string
  speakers: string
  studyHours: string
  difficulty: 'Easy' | 'Moderate' | 'Hard'
  tagline: string
  whyValuable: string
  highlights: string[]
  scores: ValueScores
  /** Tailwind gradient classes used for this language's accent */
  gradient: string
  accentText: string
  accentBg: string
  lessons: Lesson[]
  phrases: Phrase[]
}

export const scoreLabels: Record<keyof ValueScores, string> = {
  gdpAccess: 'GDP access',
  tradeUtility: 'Trade utility',
  diplomacy: 'Diplomatic weight',
  wagePremium: 'Wage premium',
}

export const overallScore = (s: ValueScores) =>
  Math.round((s.gdpAccess + s.tradeUtility + s.diplomacy + s.wagePremium) / 4)

export const languages: Language[] = [
  {
    id: 'english',
    rank: 1,
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧',
    speechCode: 'en-US',
    speakers: '1.5B',
    studyHours: 'Varies',
    difficulty: 'Moderate',
    tagline: 'The operating system of global business',
    whyValuable:
      'English sits at number one by a massive margin. It is the default connective tissue of global finance, technology and international law, so fluency opens doors in almost every industry and country.',
    highlights: [
      'Default language of global finance and banking',
      'The working language of technology and software',
      'Standard for international law, aviation and science',
    ],
    scores: { gdpAccess: 98, tradeUtility: 97, diplomacy: 95, wagePremium: 92 },
    gradient: 'from-blue-600 to-sky-500',
    accentText: 'text-blue-600 dark:text-blue-400',
    accentBg: 'bg-blue-600',
    lessons: [
      { id: 'en-1', title: 'Professional introductions', description: 'Introduce yourself and your role with confidence.', level: 'Beginner', minutes: 10 },
      { id: 'en-2', title: 'Writing clear emails', description: 'Structure, tone and common email phrases.', level: 'Beginner', minutes: 15 },
      { id: 'en-3', title: 'Meetings and small talk', description: 'Open, steer and close a meeting naturally.', level: 'Intermediate', minutes: 15 },
      { id: 'en-4', title: 'Finance vocabulary', description: 'Revenue, margins, forecasts and reports.', level: 'Intermediate', minutes: 20 },
      { id: 'en-5', title: 'Negotiating a deal', description: 'Make offers, push back and reach agreement.', level: 'Advanced', minutes: 25 },
      { id: 'en-6', title: 'Presenting to executives', description: 'Tell a clear story with data.', level: 'Advanced', minutes: 25 },
    ],
    phrases: [
      { text: "Let's circle back", meaning: 'Discuss this again later' },
      { text: 'Bottom line', meaning: 'The final result or most important point' },
      { text: 'Touch base', meaning: 'Briefly contact someone' },
      { text: 'Ballpark figure', meaning: 'A rough estimate' },
      { text: 'On the same page', meaning: 'In agreement, understanding the same thing' },
      { text: 'Deadline', meaning: 'The time by which work must be finished' },
    ],
  },
  {
    id: 'spanish',
    rank: 2,
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    speechCode: 'es-ES',
    speakers: '560M',
    studyHours: '600–750 h',
    difficulty: 'Easy',
    tagline: 'The strongest wage premium in the Americas',
    whyValuable:
      'Spanish carries one of the strongest and most direct wage premiums across U.S. and Western Hemisphere labor markets, from healthcare and sales to law and public services.',
    highlights: [
      'Direct salary boost in U.S. jobs serving bilingual customers',
      'Gateway to fast-growing Latin American markets',
      'One of the quickest major languages for English speakers',
    ],
    scores: { gdpAccess: 80, tradeUtility: 84, diplomacy: 76, wagePremium: 90 },
    gradient: 'from-rose-500 to-orange-500',
    accentText: 'text-rose-600 dark:text-rose-400',
    accentBg: 'bg-rose-500',
    lessons: [
      { id: 'es-1', title: 'Saludos y presentaciones', description: 'Greetings and introductions.', level: 'Beginner', minutes: 10 },
      { id: 'es-2', title: 'Numbers and prices', description: 'Count, quote prices and talk about money.', level: 'Beginner', minutes: 12 },
      { id: 'es-3', title: 'Present tense verbs', description: 'Regular -ar, -er and -ir verbs.', level: 'Beginner', minutes: 15 },
      { id: 'es-4', title: 'Customer service Spanish', description: 'Help customers politely and clearly.', level: 'Intermediate', minutes: 20 },
      { id: 'es-5', title: 'Ser vs. estar', description: 'Two verbs for "to be" and when to use each.', level: 'Intermediate', minutes: 20 },
      { id: 'es-6', title: 'Business meetings', description: 'Run a meeting and close a sale in Spanish.', level: 'Advanced', minutes: 25 },
    ],
    phrases: [
      { text: 'Mucho gusto', meaning: 'Nice to meet you' },
      { text: '¿Cuánto cuesta?', meaning: 'How much does it cost?' },
      { text: 'La reunión', meaning: 'The meeting' },
      { text: 'El contrato', meaning: 'The contract' },
      { text: '¿En qué puedo ayudarle?', meaning: 'How can I help you?' },
      { text: 'De acuerdo', meaning: 'Agreed / OK' },
    ],
  },
  {
    id: 'french',
    rank: 3,
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    speechCode: 'fr-FR',
    speakers: '320M',
    studyHours: '600–750 h',
    difficulty: 'Moderate',
    tagline: 'Diplomacy and Africa’s rising economies',
    whyValuable:
      'French keeps a top-three spot through its footprint across expanding African economies and its official role in major international bodies such as the UN, EU and Olympic Committee.',
    highlights: [
      'Official language of the UN, EU and many global institutions',
      'Spoken across fast-growing African economies',
      'Strong in luxury, fashion, food and tourism industries',
    ],
    scores: { gdpAccess: 72, tradeUtility: 74, diplomacy: 93, wagePremium: 70 },
    gradient: 'from-sky-500 to-cyan-500',
    accentText: 'text-sky-600 dark:text-sky-400',
    accentBg: 'bg-sky-500',
    lessons: [
      { id: 'fr-1', title: 'Bonjour ! First words', description: 'Greetings and polite expressions.', level: 'Beginner', minutes: 10 },
      { id: 'fr-2', title: 'Pronunciation basics', description: 'Nasal vowels, silent letters and liaison.', level: 'Beginner', minutes: 15 },
      { id: 'fr-3', title: 'Articles and gender', description: 'Le, la, les, un, une and des.', level: 'Beginner', minutes: 15 },
      { id: 'fr-4', title: 'Formal vs. informal', description: 'When to use tu and vous.', level: 'Intermediate', minutes: 15 },
      { id: 'fr-5', title: 'Diplomatic French', description: 'Polite requests and formal correspondence.', level: 'Intermediate', minutes: 20 },
      { id: 'fr-6', title: 'Debating ideas', description: 'Agree, disagree and argue a position.', level: 'Advanced', minutes: 25 },
    ],
    phrases: [
      { text: 'Enchanté', meaning: 'Pleased to meet you' },
      { text: 'Je voudrais', meaning: 'I would like' },
      { text: "L'entreprise", meaning: 'The company' },
      { text: 'Le rendez-vous', meaning: 'The appointment' },
      { text: "S'il vous plaît", meaning: 'Please (formal)' },
      { text: 'Bien sûr', meaning: 'Of course' },
    ],
  },
  {
    id: 'mandarin',
    rank: 4,
    name: 'Mandarin Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    speechCode: 'zh-CN',
    speakers: '1.2B',
    studyHours: '2,200 h',
    difficulty: 'Hard',
    tagline: 'A billion speakers, concentrated value',
    whyValuable:
      'Despite having over one billion speakers, Mandarin ranks fourth because its economic value is concentrated in one region and global supply chains are shifting. It is still a huge advantage in manufacturing, sourcing and trade with China.',
    highlights: [
      'Direct access to the world’s largest manufacturing base',
      'Valuable in sourcing, logistics and supply chain roles',
      'Rare skill among Western professionals',
    ],
    scores: { gdpAccess: 82, tradeUtility: 78, diplomacy: 70, wagePremium: 66 },
    gradient: 'from-red-500 to-amber-500',
    accentText: 'text-red-600 dark:text-red-400',
    accentBg: 'bg-red-500',
    lessons: [
      { id: 'zh-1', title: 'Tones 101', description: 'The four tones and why they matter.', level: 'Beginner', minutes: 15 },
      { id: 'zh-2', title: 'Pinyin essentials', description: 'Read and pronounce romanized Chinese.', level: 'Beginner', minutes: 15 },
      { id: 'zh-3', title: 'Your first characters', description: 'Common radicals and simple characters.', level: 'Beginner', minutes: 20 },
      { id: 'zh-4', title: 'Numbers and bargaining', description: 'Prices, quantities and negotiation.', level: 'Intermediate', minutes: 20 },
      { id: 'zh-5', title: 'Business etiquette', description: 'Titles, business cards and banquets.', level: 'Intermediate', minutes: 20 },
      { id: 'zh-6', title: 'Factory visits', description: 'Talk about production, quality and orders.', level: 'Advanced', minutes: 30 },
    ],
    phrases: [
      { text: '你好', romanization: 'nǐ hǎo', meaning: 'Hello' },
      { text: '谢谢', romanization: 'xièxie', meaning: 'Thank you' },
      { text: '多少钱？', romanization: 'duōshao qián?', meaning: 'How much money?' },
      { text: '公司', romanization: 'gōngsī', meaning: 'Company' },
      { text: '合作', romanization: 'hézuò', meaning: 'Cooperation / partnership' },
      { text: '没问题', romanization: 'méi wèntí', meaning: 'No problem' },
    ],
  },
  {
    id: 'german',
    rank: 5,
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    speechCode: 'de-DE',
    speakers: '135M',
    studyHours: '~900 h',
    difficulty: 'Moderate',
    tagline: 'Highest return per hour studied',
    whyValuable:
      'German delivers an exceptionally high economic return per hour studied, thanks to Europe’s advanced manufacturing and export sectors such as automotive, engineering and chemicals.',
    highlights: [
      'Key to Europe’s largest economy and export powerhouse',
      'High demand in engineering, automotive and research',
      'Excellent return on every hour you invest',
    ],
    scores: { gdpAccess: 76, tradeUtility: 80, diplomacy: 68, wagePremium: 84 },
    gradient: 'from-amber-500 to-yellow-500',
    accentText: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-500',
    lessons: [
      { id: 'de-1', title: 'Guten Tag! Greetings', description: 'Formal and informal greetings.', level: 'Beginner', minutes: 10 },
      { id: 'de-2', title: 'Der, die, das', description: 'Noun genders and articles.', level: 'Beginner', minutes: 15 },
      { id: 'de-3', title: 'Word order', description: 'Verb second and verb final sentences.', level: 'Beginner', minutes: 15 },
      { id: 'de-4', title: 'The four cases', description: 'Nominative, accusative, dative and genitive.', level: 'Intermediate', minutes: 25 },
      { id: 'de-5', title: 'Engineering German', description: 'Technical vocabulary for industry.', level: 'Intermediate', minutes: 20 },
      { id: 'de-6', title: 'Job interviews', description: 'Present your experience in German.', level: 'Advanced', minutes: 25 },
    ],
    phrases: [
      { text: 'Freut mich', meaning: 'Pleased to meet you' },
      { text: 'Die Besprechung', meaning: 'The meeting' },
      { text: 'Das Angebot', meaning: 'The offer / quote' },
      { text: 'Wie viel kostet das?', meaning: 'How much does that cost?' },
      { text: 'Vielen Dank', meaning: 'Thank you very much' },
      { text: 'Einverstanden', meaning: 'Agreed' },
    ],
  },
]

export const getLanguage = (id: string | undefined) => languages.find((l) => l.id === id)

export const totalLessons = languages.reduce((sum, l) => sum + l.lessons.length, 0)
