import type { Metadata } from 'next'
import { Cormorant_Garamond, Inter } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/lib/language-context'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Daniel Grimaldi — Artista Plástico',
  description:
    'Daniel Grimaldi Assef — Artista plástico venezolano. Pintura figurativa contemporánea. Explora obras, colecciones y más.',
  authors: [{ name: 'Daniel Grimaldi' }],
  openGraph: {
    title: 'Daniel Grimaldi — Artista Plástico',
    description: 'Pintura que habita el territorio del anhelo. Obra figurativa contemporánea.',
    type: 'website',
    locale: 'es_VE',
    images: ['/obra_principal.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Daniel Grimaldi — Artista Plástico',
    description: 'Pintura que habita el territorio del anhelo.',
    images: ['/obra_principal.jpg'],
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎨</text></svg>",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${cormorant.variable} ${inter.variable}`}>
      <body className="bg-brand-black text-brand-text antialiased">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
