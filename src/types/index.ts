export type Language = 'es' | 'en'

export interface Bilingual {
  es: string
  en: string
}

export interface Artwork {
  id: string
  type: 'painting' | 'drawing'
  img: string
  title: Bilingual
  technique: Bilingual
  size: string
  year: string
  price: string
  status: 'available' | 'sold'
}

export interface Collection {
  slug: string
  name: Bilingual
  cover: string
  workIds: string[]
}

export interface NavItem {
  label: Bilingual
  href: string
}

export interface SiteConfig {
  name: string
  tagline: Bilingual
  email: string
  phone: string
  whatsapp: string
  instagramPersonal: string
  instagramStudio: string
}
