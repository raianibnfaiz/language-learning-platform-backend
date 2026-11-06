/**
 * Every language available in the Phrasebook.
 * The five ids shared with `languages.ts` (english, spanish, french, mandarin, german)
 * are the "featured" languages with the full set of situations.
 */

export type Region =
  | 'Western Europe'
  | 'Northern Europe'
  | 'Central & Eastern Europe'
  | 'Regional languages'
  | 'Middle East & Africa'
  | 'South Asia'
  | 'East & Southeast Asia'

export const regions: Region[] = [
  'Western Europe',
  'Northern Europe',
  'Central & Eastern Europe',
  'Regional languages',
  'Middle East & Africa',
  'South Asia',
  'East & Southeast Asia',
]

export interface CatalogLanguage {
  id: string
  name: string
  nativeName: string
  flag: string
  /** BCP 47 code for speech synthesis and recognition */
  speechCode: string
  region: Region
  /** Uses the Latin alphabet, so the learner can type answers on any keyboard */
  latin: boolean
  /** One of the five ranked LinguaWealth languages, with every situation unlocked */
  featured?: boolean
  /** Regional or less documented language: phrases are best-effort and worth double-checking */
  community?: boolean
}

type Row = [id: string, name: string, nativeName: string, flag: string, speechCode: string, region: Region, latin: boolean, extra?: 'featured' | 'community']

const rows: Row[] = [
  ['english', 'English', 'English', '🇬🇧', 'en-US', 'Western Europe', true, 'featured'],
  ['spanish', 'Spanish', 'Español', '🇪🇸', 'es-ES', 'Western Europe', true, 'featured'],
  ['french', 'French', 'Français', '🇫🇷', 'fr-FR', 'Western Europe', true, 'featured'],
  ['mandarin', 'Chinese (Mandarin)', '中文', '🇨🇳', 'zh-CN', 'East & Southeast Asia', false, 'featured'],
  ['german', 'German', 'Deutsch', '🇩🇪', 'de-DE', 'Western Europe', true, 'featured'],
  ['albanian', 'Albanian', 'Shqip', '🇦🇱', 'sq-AL', 'Central & Eastern Europe', true],
  ['arabic', 'Arabic', 'العربية', '🇸🇦', 'ar-SA', 'Middle East & Africa', false],
  ['moroccan-arabic', 'Arabic (Moroccan)', 'الدارجة', '🇲🇦', 'ar-MA', 'Middle East & Africa', false, 'community'],
  ['armenian', 'Armenian', 'Հայերեն', '🇦🇲', 'hy-AM', 'Middle East & Africa', false],
  ['basque', 'Basque', 'Euskara', '🇪🇸', 'eu-ES', 'Regional languages', true, 'community'],
  ['bengali', 'Bengali', 'বাংলা', '🇧🇩', 'bn-BD', 'South Asia', false],
  ['breton', 'Breton', 'Brezhoneg', '🇫🇷', 'br-FR', 'Regional languages', true, 'community'],
  ['bulgarian', 'Bulgarian', 'Български', '🇧🇬', 'bg-BG', 'Central & Eastern Europe', false],
  ['burmese', 'Burmese', 'မြန်မာ', '🇲🇲', 'my-MM', 'East & Southeast Asia', false],
  ['catalan', 'Catalan', 'Català', '🇦🇩', 'ca-ES', 'Regional languages', true],
  ['corsican', 'Corsican', 'Corsu', '🇫🇷', 'co-FR', 'Regional languages', true, 'community'],
  ['croatian', 'Croatian', 'Hrvatski', '🇭🇷', 'hr-HR', 'Central & Eastern Europe', true],
  ['czech', 'Czech', 'Čeština', '🇨🇿', 'cs-CZ', 'Central & Eastern Europe', true],
  ['danish', 'Danish', 'Dansk', '🇩🇰', 'da-DK', 'Northern Europe', true],
  ['dutch', 'Dutch', 'Nederlands', '🇳🇱', 'nl-NL', 'Western Europe', true],
  ['estonian', 'Estonian', 'Eesti', '🇪🇪', 'et-EE', 'Northern Europe', true],
  ['finnish', 'Finnish', 'Suomi', '🇫🇮', 'fi-FI', 'Northern Europe', true],
  ['greek', 'Greek', 'Ελληνικά', '🇬🇷', 'el-GR', 'Western Europe', false],
  ['hebrew', 'Hebrew', 'עברית', '🇮🇱', 'he-IL', 'Middle East & Africa', false],
  ['hindi', 'Hindi', 'हिन्दी', '🇮🇳', 'hi-IN', 'South Asia', false],
  ['hungarian', 'Hungarian', 'Magyar', '🇭🇺', 'hu-HU', 'Central & Eastern Europe', true],
  ['icelandic', 'Icelandic', 'Íslenska', '🇮🇸', 'is-IS', 'Northern Europe', true],
  ['indonesian', 'Indonesian', 'Bahasa Indonesia', '🇮🇩', 'id-ID', 'East & Southeast Asia', true],
  ['italian', 'Italian', 'Italiano', '🇮🇹', 'it-IT', 'Western Europe', true],
  ['japanese', 'Japanese', '日本語', '🇯🇵', 'ja-JP', 'East & Southeast Asia', false],
  ['khmer', 'Khmer', 'ខ្មែរ', '🇰🇭', 'km-KH', 'East & Southeast Asia', false],
  ['korean', 'Korean', '한국어', '🇰🇷', 'ko-KR', 'East & Southeast Asia', false],
  ['latvian', 'Latvian', 'Latviešu', '🇱🇻', 'lv-LV', 'Northern Europe', true],
  ['lithuanian', 'Lithuanian', 'Lietuvių', '🇱🇹', 'lt-LT', 'Northern Europe', true],
  ['malay', 'Malay', 'Bahasa Melayu', '🇲🇾', 'ms-MY', 'East & Southeast Asia', true],
  ['norwegian', 'Norwegian', 'Norsk', '🇳🇴', 'nb-NO', 'Northern Europe', true],
  ['occitan', 'Occitan', 'Occitan', '🇫🇷', 'oc-FR', 'Regional languages', true, 'community'],
  ['persian', 'Persian', 'فارسی', '🇮🇷', 'fa-IR', 'Middle East & Africa', false],
  ['polish', 'Polish', 'Polski', '🇵🇱', 'pl-PL', 'Central & Eastern Europe', true],
  ['portuguese', 'Portuguese', 'Português', '🇧🇷', 'pt-BR', 'Western Europe', true],
  ['romanian', 'Romanian', 'Română', '🇷🇴', 'ro-RO', 'Central & Eastern Europe', true],
  ['russian', 'Russian', 'Русский', '🇷🇺', 'ru-RU', 'Central & Eastern Europe', false],
  ['serbian', 'Serbian', 'Српски', '🇷🇸', 'sr-RS', 'Central & Eastern Europe', false],
  ['slovak', 'Slovak', 'Slovenčina', '🇸🇰', 'sk-SK', 'Central & Eastern Europe', true],
  ['swahili', 'Swahili', 'Kiswahili', '🇰🇪', 'sw-KE', 'Middle East & Africa', true],
  ['swedish', 'Swedish', 'Svenska', '🇸🇪', 'sv-SE', 'Northern Europe', true],
  ['tagalog', 'Tagalog', 'Tagalog', '🇵🇭', 'fil-PH', 'East & Southeast Asia', true],
  ['thai', 'Thai', 'ไทย', '🇹🇭', 'th-TH', 'East & Southeast Asia', false],
  ['turkish', 'Turkish', 'Türkçe', '🇹🇷', 'tr-TR', 'Middle East & Africa', true],
  ['ukrainian', 'Ukrainian', 'Українська', '🇺🇦', 'uk-UA', 'Central & Eastern Europe', false],
  ['urdu', 'Urdu', 'اردو', '🇵🇰', 'ur-PK', 'South Asia', false],
  ['vietnamese', 'Vietnamese', 'Tiếng Việt', '🇻🇳', 'vi-VN', 'East & Southeast Asia', true],
  ['walloon', 'Walloon', 'Walon', '🇧🇪', 'wa-BE', 'Regional languages', true, 'community'],
  ['zulu', 'Zulu', 'isiZulu', '🇿🇦', 'zu-ZA', 'Middle East & Africa', true],
]

export const catalog: CatalogLanguage[] = rows.map(([id, name, nativeName, flag, speechCode, region, latin, extra]) => ({
  id,
  name,
  nativeName,
  flag,
  speechCode,
  region,
  latin,
  featured: extra === 'featured',
  community: extra === 'community',
}))

/** Featured first, then alphabetical */
export const catalogSorted = [...catalog].sort(
  (a, b) => Number(!!b.featured) - Number(!!a.featured) || a.name.localeCompare(b.name),
)

export const getCatalogLanguage = (id: string | undefined) => catalog.find((l) => l.id === id)

/** Playful accent colors, picked per language so the grid looks lively */
const palettes = [
  'from-primary-600 to-emerald-400',
  'from-sky-500 to-cyan-400',
  'from-violet-500 to-fuchsia-400',
  'from-orange-500 to-amber-400',
  'from-rose-500 to-pink-400',
  'from-teal-500 to-lime-400',
  'from-indigo-500 to-sky-400',
  'from-amber-500 to-yellow-400',
]

export function accentFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return palettes[h % palettes.length]
}
