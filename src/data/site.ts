import type { SiteConfig, NavItem, Bilingual } from '@/types'

export const siteConfig: SiteConfig = {
  name: 'Daniel Grimaldi',
  tagline: {
    es: 'Pintura que habita el territorio del anhelo.',
    en: 'Painting that inhabits the territory of longing.',
  },
  email: 'danieco.comics@gmail.com',
  phone: '04244-359019',
  whatsapp: '584244359019',
  instagramPersonal: 'https://instagram.com/daniel_grimaldi',
  instagramStudio: 'https://instagram.com/grim4rt_',
}

export const navItems: NavItem[] = [
  { label: { es: 'Obras', en: 'Works' }, href: '/#obras' },
  { label: { es: 'Colecciones', en: 'Collections' }, href: '/colecciones' },
  { label: { es: 'Sobre mí', en: 'About' }, href: '/#bio' },
  { label: { es: 'Contacto', en: 'Contact' }, href: '/#contacto' },
]

export const heroContent = {
  eyebrow: { es: 'Artista Plástico — Venezuela', en: 'Visual Artist — Venezuela' } satisfies Bilingual,
}

export const bio = {
  paragraphs: [
    {
      es: 'Daniel Grimaldi Assef (Valencia, Venezuela, 2001) es un artista visual cuya práctica se centra en la pintura figurativa contemporánea. Inició su formación artística en 2021 como pupilo del artista Nelson Jovandaric, complementando su aprendizaje con talleres y estudios en dibujo analítico, pintura, color y composición visual.',
      en: 'Daniel Grimaldi Assef (Valencia, Venezuela, 2001) is a visual artist whose practice focuses on contemporary figurative painting. He began his artistic training in 2021 as a student of artist Nelson Jovandaric, complementing his learning with workshops and studies in analytical drawing, painting, color, and visual composition.',
    },
    {
      es: 'Su obra explora la relación entre la figura humana, el espacio psicológico y el simbolismo, construyendo imágenes que oscilan entre la observación, la memoria y la imaginación. A través de escenarios ambiguos y narrativas abiertas, desarrolla una investigación pictórica centrada en el anhelo, la contemplación y la transformación de la experiencia interior.',
      en: 'His work explores the relationship between the human figure, psychological space, and symbolism, building images that oscillate between observation, memory, and imagination. Through ambiguous scenarios and open narratives, he develops a pictorial investigation centered on longing, contemplation, and the transformation of inner experience.',
    },
  ] satisfies Bilingual[],
  role: { es: 'Artista Plástico', en: 'Visual Artist' } satisfies Bilingual,
  location: 'Valencia, Venezuela',
  since: 'Desde 2021',
}
