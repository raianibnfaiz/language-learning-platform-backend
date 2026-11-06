// Test fixture in the same shape as the client's source-data/catalog.ts (3 of the 54 languages).
export type Region =
  | 'Western Europe'
  | 'Northern Europe'
  | 'Central & Eastern Europe'
  | 'Regional languages'
  | 'Middle East & Africa'
  | 'South Asia'
  | 'East & Southeast Asia'

export interface CatalogLanguage {
  id: string
  name: string
  nativeName: string
  flag: string
  speechCode: string
  region: Region
  latin: boolean
  featured?: boolean
  community?: boolean
}

export const catalog: CatalogLanguage[] = [
  { id: 'spanish', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', speechCode: 'es-ES', region: 'Western Europe', latin: true, featured: true },
  { id: 'english', name: 'English', nativeName: 'English', flag: '🇬🇧', speechCode: 'en-GB', region: 'Western Europe', latin: true, featured: true },
  { id: 'japanese', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', speechCode: 'ja-JP', region: 'East & Southeast Asia', latin: false },
]
