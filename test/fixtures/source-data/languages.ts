// Test fixture in the same shape as the client's source-data/languages.ts (2 of the 5 ranked languages).
const lessons = (p: string, names: string[]) =>
  names.map((title, i) => ({
    id: `${p}-${i + 1}`,
    title,
    description: `${title} lesson`,
    level: (i < 2 ? 'Beginner' : i < 4 ? 'Intermediate' : 'Advanced') as 'Beginner' | 'Intermediate' | 'Advanced',
    minutes: 10 + i * 5,
  }))

export const languages = [
  {
    id: 'english', rank: 1, name: 'English', nativeName: 'English', flag: '🇬🇧', speechCode: 'en-GB',
    speakers: '1.5B', studyHours: 'n/a', difficulty: 'Moderate' as const, tagline: 'The language of business',
    whyValuable: 'Global lingua franca', highlights: ['Business', 'Science', 'Tech'],
    scores: { gdpAccess: 98, tradeUtility: 97, diplomacy: 95, wagePremium: 90 },
    gradient: 'from-blue-500 to-indigo-600', accentText: 'text-blue-600', accentBg: 'bg-blue-50',
    lessons: lessons('en', ['Greetings', 'Small talk', 'Meetings', 'Emails', 'Negotiation', 'Presenting']),
    phrases: [{ text: 'Nice to meet you', meaning: 'Nice to meet you' }],
  },
  {
    id: 'spanish', rank: 2, name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', speechCode: 'es-ES',
    speakers: '560M', studyHours: '600', difficulty: 'Easy' as const, tagline: 'Two continents',
    whyValuable: 'Americas + Europe', highlights: ['Trade', 'Travel', 'Culture'],
    scores: { gdpAccess: 80, tradeUtility: 85, diplomacy: 75, wagePremium: 71 },
    gradient: 'from-red-500 to-yellow-500', accentText: 'text-red-600', accentBg: 'bg-red-50',
    lessons: lessons('es', ['Saludos', 'Café', 'Reuniones', 'Correo', 'Negociar', 'Presentar']),
    phrases: [{ text: 'Mucho gusto', meaning: 'Nice to meet you' }],
  },
]
