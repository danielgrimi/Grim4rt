# Grim4rt Next.js Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Grim4rt's single-file `index.html` static site as a component-based Next.js app (same stack/conventions as the INDOTEL project), faithfully porting all current content and behavior, with static typed data files replacing the broken localStorage "admin" panel.

**Architecture:** Next.js 16 App Router with real routes (`/`, `/colecciones`, `/colecciones/[slug]`) replacing the current JS-faked page-switching. Content lives in typed data files (`src/data/`); UI is decomposed into small, single-purpose components under `src/components/{layout,sections,collections,ui}`; bilingual ES/EN state lives in a React Context provider.

**Tech Stack:** Next.js 16.2.7, React 19.2.4, TypeScript 5, Tailwind CSS 3.4, Framer Motion 12, Vitest 4 + Testing Library + jsdom, ESLint 9.

## Global Constraints

- Faithful port only — no visual/content redesign in this phase (per approved spec).
- No admin UI, no localStorage persistence — content changes happen by editing `src/data/*.ts`.
- Build everything on branch `rebuild/nextjs` (already created). Do not touch `main` — it stays the live GitHub Pages static site until a separate, deliberate cutover.
- No deployment/hosting setup in this plan — verification is local (`npm run dev`, `npm run build`, `npm run test:run`, `npm run lint`).
- Brand colors (from current `index.html` `:root`): black `#0D0D0D`, dark `#141414`, card `#1A1A1A`, border `#2A2A2A`, accent `#8B2E2E`, accent-light `#B03A3A`, text `#E8E4DC`, muted `#7A7068`.
- Fonts: Cormorant Garamond (display/italic accents), Inter (body) — same as current site, loaded via `next/font/google` instead of a Google Fonts `<link>`.
- All prior work happened on `main` at commit `b4e7205` (after PRs #1–#3 merged) plus the spec commit `a2357ea` on this branch. The `rebuild/nextjs` branch already exists locally with the spec committed.

---

### Task 1: Scaffold project tooling & config

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/test/setup.ts`
- Create: `src/app/favicon.ico` (copy from existing repo — see step 8)

**Interfaces:**
- Produces: `@/*` path alias resolving to `src/*` (used by every later task's imports), the `npm run dev|build|start|lint|test|test:run` scripts, Tailwind brand color tokens (`brand.black`, `brand.dark`, `brand.card`, `brand.border`, `brand.accent`, `brand.accentLight`, `brand.text`, `brand.muted`) and font family tokens (`font-display`, `font-sans`) consumed by every component task.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "grim4rt",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "framer-motion": "^12.40.0",
    "next": "16.2.7",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.0.2",
    "autoprefixer": "^10.5.0",
    "eslint": "^9",
    "eslint-config-next": "16.2.7",
    "jsdom": "^29.1.1",
    "postcss": "^8.5.15",
    "tailwindcss": "^3.4.19",
    "typescript": "^5",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
```

- [ ] **Step 4: Create `tailwind.config.ts`**

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          black:       '#0D0D0D',
          dark:        '#141414',
          card:        '#1A1A1A',
          border:      '#2A2A2A',
          accent:      '#8B2E2E',
          accentLight: '#B03A3A',
          text:        '#E8E4DC',
          muted:       '#7A7068',
        },
      },
      fontFamily: {
        display: ['var(--font-cormorant)', 'Cormorant Garamond', 'serif'],
        sans:    ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 5: Create `postcss.config.mjs`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Create `eslint.config.mjs`**

```javascript
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
```

- [ ] **Step 7: Create `vitest.config.ts`**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Step 8: Create `.gitignore`**

```
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 9: Create `src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 10: Install dependencies**

Run: `npm install`
Expected: installs without errors, creates `package-lock.json` and `node_modules/`.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs eslint.config.mjs vitest.config.ts .gitignore src/test/setup.ts
git commit -m "chore: scaffold Next.js/TypeScript/Tailwind/Vitest project tooling"
```

---

### Task 2: Root layout, global styles, fonts, and placeholder home page

**Files:**
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx` (temporary placeholder, replaced in Task 13)

**Interfaces:**
- Consumes: Tailwind brand tokens and font families from Task 1's `tailwind.config.ts`.
- Produces: `RootLayout` (wraps every route in `<html>`/`<body>`, applies fonts and base background/text color) — every later page/component renders inside this.

- [ ] **Step 1: Create `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html {
    scroll-behavior: smooth;
    -webkit-text-size-adjust: 100%;
  }

  body {
    background-color: #0D0D0D;
    color: #E8E4DC;
    font-family: var(--font-inter), Inter, sans-serif;
    font-weight: 300;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-cormorant), 'Cormorant Garamond', serif;
    font-weight: 400;
  }

  ::selection {
    background-color: #8B2E2E;
    color: #E8E4DC;
  }

  [id] {
    scroll-margin-top: 90px;
  }
}
```

- [ ] **Step 2: Create `src/app/layout.tsx`**

```tsx
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
```

Note: this imports `LanguageProvider` from `@/lib/language-context`, created in Task 4. Task 3 (data/types) has no dependency on it, so it can run before or after Task 2 — but the app will not compile until Task 4 exists. That's fine; Task 2's own verification step only checks the file is syntactically consistent with the plan, and the full build is verified again at the end of Task 4.

- [ ] **Step 3: Create temporary `src/app/page.tsx`**

```tsx
export default function Home() {
  return <h1 className="p-10 text-4xl">Grim4rt rebuild in progress</h1>
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add root layout, global styles, and fonts"
```

(Build verification for this task happens at the end of Task 4, once `LanguageProvider` exists and `npm run build` can actually succeed.)

---

### Task 3: Types and data files

**Files:**
- Create: `src/types/index.ts`
- Create: `src/data/site.ts`
- Create: `src/data/artworks.ts`
- Create: `src/data/collections.ts`
- Test: `src/test/data.test.ts`

**Interfaces:**
- Produces: `Bilingual`, `Language`, `Artwork`, `Collection`, `SiteConfig`, `NavItem` types (used by every component task); `siteConfig`, `navItems`, `bio` (from `data/site.ts`); `artworks: Artwork[]` (from `data/artworks.ts`); `collections: Collection[]` (from `data/collections.ts`).

- [ ] **Step 1: Create `src/types/index.ts`**

```typescript
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
```

- [ ] **Step 2: Create `src/data/site.ts`**

```typescript
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
```

- [ ] **Step 3: Create `src/data/artworks.ts`**

```typescript
import type { Artwork } from '@/types'

export const artworks: Artwork[] = [
  { id: 'obra0405', type: 'drawing', img: 'Estudio_de_Movimiento.jpg', title: { es: 'Estudio de Movimiento', en: 'Movement Study' }, technique: { es: 'Carboncillo sobre papel', en: 'Charcoal on paper' }, size: '65 × 50 cm', year: '2025', price: 'Colección Privada', status: 'sold' },
  { id: 'obra0770', type: 'drawing', img: 'Mirada_Intrapersonal.jpg', title: { es: 'Mirada Intrapersonal', en: 'Intrapersonal Gaze' }, technique: { es: 'Carboncillo y tiza sobre papel craft', en: 'Charcoal and chalk on craft paper' }, size: '40 × 50 cm', year: '2026', price: '$450', status: 'available' },
  { id: 'obra4694', type: 'painting', img: 'Anhelo.jpg', title: { es: 'Anhelo', en: 'Longing' }, technique: { es: 'Acrílico y óleo sobre tela', en: 'Acrylic and oil on canvas' }, size: '80 × 60 cm', year: '2026', price: '$600', status: 'sold' },
  { id: 'obra5038', type: 'painting', img: 'Volumen_Esencial.jpg', title: { es: 'Volumen Esencial', en: 'Essential Volume' }, technique: { es: 'Óleo sobre madera', en: 'Oil on wood' }, size: '70 × 50 cm', year: '2026', price: '$700', status: 'available' },
  { id: 'obra8735', type: 'painting', img: 'Impetu.jpg', title: { es: 'Ímpetu', en: 'Impetus' }, technique: { es: 'Acrílico sobre lienzo', en: 'Acrylic on canvas' }, size: '100 × 80 cm', year: '2026', price: '$850', status: 'available' },
  { id: 'obra9426', type: 'painting', img: 'Antes_del_Escenario.jpg', title: { es: 'Antes del Escenario', en: 'Before the Stage' }, technique: { es: 'Acrílico sobre tela', en: 'Acrylic on canvas' }, size: '70 × 50 cm', year: '2026', price: '$650', status: 'available' },
  { id: 'obra1001', type: 'painting', img: 'Alanna.jpg', title: { es: 'Alanna', en: 'Alanna' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1002', type: 'painting', img: 'Bailaora.jpg', title: { es: 'Bailaora', en: 'Flamenco Dancer' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1003', type: 'painting', img: 'Bailarina.jpg', title: { es: 'Bailarina', en: 'Ballerina' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1004', type: 'painting', img: 'Bailarina2.jpg', title: { es: 'Bailarina II', en: 'Ballerina II' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1005', type: 'painting', img: 'Boat.jpg', title: { es: 'Barco', en: 'Boat' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1006', type: 'drawing', img: 'Boceto.jpg', title: { es: 'Boceto', en: 'Sketch' }, technique: { es: 'Técnica mixta sobre papel', en: 'Mixed media on paper' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1007', type: 'painting', img: 'Caballo.jpg', title: { es: 'Caballo', en: 'Horse' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1008', type: 'painting', img: 'Caballo2.jpg', title: { es: 'Caballo II', en: 'Horse II' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1009', type: 'painting', img: 'Caballo3.jpg', title: { es: 'Caballo III', en: 'Horse III' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1010', type: 'painting', img: 'Caballo4.jpg', title: { es: 'Caballo IV', en: 'Horse IV' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1011', type: 'painting', img: 'Caballo5.jpg', title: { es: 'Caballo V', en: 'Horse V' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1012', type: 'painting', img: 'Copa.jpg', title: { es: 'Copa', en: 'Glass' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1013', type: 'painting', img: 'Dancing.jpg', title: { es: 'Bailando', en: 'Dancing' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1014', type: 'painting', img: 'Firme.jpg', title: { es: 'Firme', en: 'Steady' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1015', type: 'painting', img: 'Flores.jpg', title: { es: 'Flores', en: 'Flowers' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1016', type: 'painting', img: 'Gorilla.jpg', title: { es: 'Gorila', en: 'Gorilla' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1017', type: 'painting', img: 'Losroques.jpg', title: { es: 'Los Roques', en: 'Los Roques' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1018', type: 'painting', img: 'Mono.jpg', title: { es: 'Mono', en: 'Monkey' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1019', type: 'painting', img: 'Mono2.jpg', title: { es: 'Mono II', en: 'Monkey II' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1020', type: 'painting', img: 'Mono3.jpg', title: { es: 'Mono III', en: 'Monkey III' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1021', type: 'painting', img: 'Morocho.jpg', title: { es: 'Morocho', en: 'Morocho' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1022', type: 'painting', img: 'Morocho2.jpg', title: { es: 'Morocho II', en: 'Morocho II' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1023', type: 'painting', img: 'Payaso.jpg', title: { es: 'Payaso', en: 'Clown' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1024', type: 'painting', img: 'Payaso2.jpg', title: { es: 'Payaso II', en: 'Clown II' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1025', type: 'painting', img: 'Saltoangel.jpg', title: { es: 'Salto Ángel', en: 'Angel Falls' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1026', type: 'painting', img: 'Sancharbel.jpg', title: { es: 'San Charbel', en: 'Saint Charbel' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1027', type: 'painting', img: 'Sancharbel2.jpg', title: { es: 'San Charbel II', en: 'Saint Charbel II' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1028', type: 'painting', img: 'Sancharbel3.jpg', title: { es: 'San Charbel III', en: 'Saint Charbel III' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1029', type: 'painting', img: 'Sanmiguel.jpg', title: { es: 'San Miguel', en: 'Saint Michael' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1030', type: 'painting', img: 'Sebu.jpg', title: { es: 'Sebú', en: 'Sebu' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1031', type: 'painting', img: 'Silence.jpg', title: { es: 'Silencio', en: 'Silence' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1032', type: 'painting', img: 'Sintitulo.jpg', title: { es: 'Sin Título', en: 'Untitled' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1033', type: 'painting', img: 'Sintitulo2.jpg', title: { es: 'Sin Título II', en: 'Untitled II' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1034', type: 'painting', img: 'Sintitulo3.jpg', title: { es: 'Sin Título III', en: 'Untitled III' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1035', type: 'painting', img: 'Sintitulo4.jpg', title: { es: 'Sin Título IV', en: 'Untitled IV' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1036', type: 'painting', img: 'Sombrero.jpg', title: { es: 'Sombrero', en: 'Hat' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1037', type: 'painting', img: 'Theheartsheavyness.jpg', title: { es: 'El Peso del Corazón', en: "The Heart's Heaviness" }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1038', type: 'painting', img: 'Torero.jpg', title: { es: 'Torero', en: 'Bullfighter' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1039', type: 'painting', img: 'Toro.jpg', title: { es: 'Toro', en: 'Bull' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1040', type: 'painting', img: 'Toro2.jpg', title: { es: 'Toro II', en: 'Bull II' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1041', type: 'painting', img: 'Toro3.jpg', title: { es: 'Toro III', en: 'Bull III' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1042', type: 'painting', img: 'Virgen.jpg', title: { es: 'Virgen', en: 'Virgin' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
  { id: 'obra1043', type: 'painting', img: 'Whiskey.jpg', title: { es: 'Whiskey', en: 'Whiskey' }, technique: { es: 'Técnica mixta sobre lienzo', en: 'Mixed media on canvas' }, size: '— × — cm', year: '2026', price: 'Consultar', status: 'available' },
]
```

- [ ] **Step 4: Create `src/data/collections.ts`**

```typescript
import type { Collection } from '@/types'

export const collections: Collection[] = [
  { slug: 'toros', name: { es: 'Toros', en: 'Bulls' }, cover: '', workIds: [] },
  { slug: 'bailarinas', name: { es: 'Bailarinas', en: 'Dancers' }, cover: '', workIds: [] },
  { slug: 'figura-humana', name: { es: 'Figura Humana', en: 'Human Figure' }, cover: 'Anhelo.jpg', workIds: ['obra4694', 'obra5038'] },
  { slug: 'estudios', name: { es: 'Estudios', en: 'Studies' }, cover: 'Estudio_de_Movimiento.jpg', workIds: ['obra0405', 'obra0770'] },
]
```

- [ ] **Step 5: Write the failing test `src/test/data.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { artworks } from '@/data/artworks'
import { collections } from '@/data/collections'

describe('artworks data', () => {
  it('has exactly 49 entries', () => {
    expect(artworks).toHaveLength(49)
  })

  it('has unique ids', () => {
    const ids = artworks.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has both a painting and a drawing type', () => {
    const types = new Set(artworks.map((a) => a.type))
    expect(types.has('painting')).toBe(true)
    expect(types.has('drawing')).toBe(true)
  })

  it('has both available and sold statuses', () => {
    const statuses = new Set(artworks.map((a) => a.status))
    expect(statuses.has('available')).toBe(true)
    expect(statuses.has('sold')).toBe(true)
  })
})

describe('collections data', () => {
  it('has exactly 4 collections', () => {
    expect(collections).toHaveLength(4)
  })

  it('references only existing artwork ids', () => {
    const artworkIds = new Set(artworks.map((a) => a.id))
    for (const collection of collections) {
      for (const workId of collection.workIds) {
        expect(artworkIds.has(workId)).toBe(true)
      }
    }
  })

  it('has unique slugs', () => {
    const slugs = collections.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test:run -- src/test/data.test.ts`
Expected: FAIL — module `@/data/artworks` or `@/data/collections` not found (if run before steps 1-4 exist). Since steps 1-4 already created these files above, this run should actually PASS immediately. If it fails on a count mismatch, re-count the `artworks` array in Step 3 against the source `baseWorks` object in `main`'s `index.html` (lines ~859-901) and fix any transcription error before proceeding.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test:run -- src/test/data.test.ts`
Expected: PASS (4 tests in `artworks data`, 3 tests in `collections data`)

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/data/site.ts src/data/artworks.ts src/data/collections.ts src/test/data.test.ts
git commit -m "feat: add typed data layer for artworks, collections, and site config"
```

---

### Task 4: Language context, useLanguage hook, and LanguageToggle component

**Files:**
- Create: `src/lib/language-context.tsx`
- Create: `src/components/layout/LanguageToggle.tsx`
- Test: `src/test/LanguageToggle.test.tsx`

**Interfaces:**
- Consumes: `Language` type from `@/types` (Task 3).
- Produces: `LanguageProvider` (wraps root layout, from Task 2), `useLanguage(): { language: Language, setLanguage: (l: Language) => void }` hook consumed by every content-rendering component in later tasks.

- [ ] **Step 1: Create `src/lib/language-context.tsx`**

```tsx
'use client'
import { createContext, useContext, useState } from 'react'
import type { Language } from '@/types'

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('es')
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
```

- [ ] **Step 2: Write the failing test `src/test/LanguageToggle.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider, useLanguage } from '@/lib/language-context'
import { LanguageToggle } from '@/components/layout/LanguageToggle'

function CurrentLanguage() {
  const { language } = useLanguage()
  return <span data-testid="current-language">{language}</span>
}

describe('LanguageToggle', () => {
  it('defaults to Spanish', () => {
    render(
      <LanguageProvider>
        <CurrentLanguage />
      </LanguageProvider>
    )
    expect(screen.getByTestId('current-language')).toHaveTextContent('es')
  })

  it('switches to English when EN is clicked', () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
        <CurrentLanguage />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByTestId('current-language')).toHaveTextContent('en')
  })

  it('switches back to Spanish when ES is clicked', () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
        <CurrentLanguage />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    fireEvent.click(screen.getByRole('button', { name: 'ES' }))
    expect(screen.getByTestId('current-language')).toHaveTextContent('es')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:run -- src/test/LanguageToggle.test.tsx`
Expected: FAIL with "Cannot find module '@/components/layout/LanguageToggle'"

- [ ] **Step 4: Create `src/components/layout/LanguageToggle.tsx`**

```tsx
'use client'
import { useLanguage } from '@/lib/language-context'

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage()

  return (
    <div className="flex items-center gap-2 text-xs tracking-wide">
      <button
        onClick={() => setLanguage('es')}
        className={language === 'es' ? 'text-brand-text' : 'text-brand-muted hover:text-brand-text transition-colors'}
      >
        ES
      </button>
      <span className="text-brand-muted">/</span>
      <button
        onClick={() => setLanguage('en')}
        className={language === 'en' ? 'text-brand-text' : 'text-brand-muted hover:text-brand-text transition-colors'}
      >
        EN
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:run -- src/test/LanguageToggle.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Verify the full app builds**

Now that `LanguageProvider` exists, Task 2's `layout.tsx` import resolves. Run:
`npm run build`
Expected: build succeeds (the placeholder `page.tsx` from Task 2 is the only route).

- [ ] **Step 7: Commit**

```bash
git add src/lib/language-context.tsx src/components/layout/LanguageToggle.tsx src/test/LanguageToggle.test.tsx
git commit -m "feat: add bilingual language context and toggle component"
```

---

### Task 5: Navbar component

**Files:**
- Create: `src/components/layout/Navbar.tsx`
- Test: `src/test/Navbar.test.tsx`

**Interfaces:**
- Consumes: `navItems`, `siteConfig` from `@/data/site` (Task 3), `useLanguage` from `@/lib/language-context` (Task 4), `LanguageToggle` (Task 4).
- Produces: `Navbar` component, used in Task 13's home page and Task 14/15's collections pages.

- [ ] **Step 1: Write the failing test `src/test/Navbar.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { Navbar } from '@/components/layout/Navbar'

function renderNavbar() {
  return render(
    <LanguageProvider>
      <Navbar />
    </LanguageProvider>
  )
}

describe('Navbar', () => {
  it('renders all nav items in Spanish by default', () => {
    renderNavbar()
    expect(screen.getByText('Obras')).toBeInTheDocument()
    expect(screen.getByText('Colecciones')).toBeInTheDocument()
    expect(screen.getByText('Sobre mí')).toBeInTheDocument()
    expect(screen.getByText('Contacto')).toBeInTheDocument()
  })

  it('renders nav items in English after toggling language', () => {
    renderNavbar()
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Works')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
  })

  it('renders the site name', () => {
    renderNavbar()
    expect(screen.getByText('Daniel Grimaldi')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/Navbar.test.tsx`
Expected: FAIL with "Cannot find module '@/components/layout/Navbar'"

- [ ] **Step 3: Create `src/components/layout/Navbar.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { navItems, siteConfig } from '@/data/site'
import { useLanguage } from '@/lib/language-context'
import { LanguageToggle } from '@/components/layout/LanguageToggle'

export function Navbar() {
  const { language } = useLanguage()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-brand-black/90 backdrop-blur-sm border-b border-brand-border">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 flex items-center justify-between h-16 md:h-20">
        <Link href="/" className="font-display text-lg text-brand-text">
          {siteConfig.name}
        </Link>
        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-brand-text/80 hover:text-brand-text transition-colors"
            >
              {item.label[language]}
            </Link>
          ))}
        </nav>
        <LanguageToggle />
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/Navbar.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Navbar.tsx src/test/Navbar.test.tsx
git commit -m "feat: add Navbar component with bilingual nav items"
```

---

### Task 6: Footer, WhatsAppButton, and BackButton components

**Files:**
- Create: `src/components/layout/Footer.tsx`
- Create: `src/components/layout/WhatsAppButton.tsx`
- Create: `src/components/ui/BackButton.tsx`
- Test: `src/test/Footer.test.tsx`
- Test: `src/test/WhatsAppButton.test.tsx`

**Interfaces:**
- Consumes: `siteConfig` from `@/data/site` (Task 3), `useLanguage` from `@/lib/language-context` (Task 4).
- Produces: `Footer`, `WhatsAppButton` (used in Task 13's home page and Task 14/15's collections pages), `BackButton` (used in Task 15's collection detail page).

- [ ] **Step 1: Write the failing test `src/test/Footer.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { Footer } from '@/components/layout/Footer'

describe('Footer', () => {
  it('renders the copyright line', () => {
    render(
      <LanguageProvider>
        <Footer />
      </LanguageProvider>
    )
    expect(screen.getByText(/Daniel Grimaldi © 2026/)).toBeInTheDocument()
  })

  it('renders the Spanish rights line by default', () => {
    render(
      <LanguageProvider>
        <Footer />
      </LanguageProvider>
    )
    expect(screen.getByText('Todos los derechos reservados')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write the failing test `src/test/WhatsAppButton.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'

describe('WhatsAppButton', () => {
  it('links to the correct wa.me URL', () => {
    render(<WhatsAppButton />)
    const link = screen.getByRole('link', { name: /whatsapp/i })
    expect(link).toHaveAttribute('href', 'https://wa.me/584244359019')
  })

  it('opens in a new tab', () => {
    render(<WhatsAppButton />)
    const link = screen.getByRole('link', { name: /whatsapp/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:run -- src/test/Footer.test.tsx src/test/WhatsAppButton.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Create `src/components/layout/Footer.tsx`**

```tsx
'use client'
import { useLanguage } from '@/lib/language-context'

export function Footer() {
  const { language } = useLanguage()
  const rights = language === 'es' ? 'Todos los derechos reservados' : 'All rights reserved'

  return (
    <footer className="flex items-center justify-center gap-4 py-8 text-xs text-brand-muted border-t border-brand-border">
      <span>Daniel Grimaldi © 2026</span>
      <span>{rights}</span>
    </footer>
  )
}
```

- [ ] **Step 5: Create `src/components/layout/WhatsAppButton.tsx`**

```tsx
import { siteConfig } from '@/data/site'

export function WhatsAppButton() {
  const whatsappUrl = `https://wa.me/${siteConfig.whatsapp}`

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar por WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg shadow-black/30 hover:scale-105 transition-transform duration-150"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      <span className="sr-only">WhatsApp</span>
    </a>
  )
}
```

Note: the `<span className="sr-only">WhatsApp</span>` plus `aria-label` both name the link "Contactar por WhatsApp" / "WhatsApp" for accessible name computation — the test's `{ name: /whatsapp/i }` matches via the `aria-label`.

- [ ] **Step 6: Create `src/components/ui/BackButton.tsx`**

```tsx
import Link from 'next/link'

export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm text-brand-muted hover:text-brand-text transition-colors"
    >
      ← {label}
    </Link>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:run -- src/test/Footer.test.tsx src/test/WhatsAppButton.test.tsx`
Expected: PASS (2 tests + 2 tests)

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/Footer.tsx src/components/layout/WhatsAppButton.tsx src/components/ui/BackButton.tsx src/test/Footer.test.tsx src/test/WhatsAppButton.test.tsx
git commit -m "feat: add Footer, WhatsAppButton, and BackButton components"
```

---

### Task 7: ArtworkCard component

**Files:**
- Create: `src/components/ui/ArtworkCard.tsx`
- Test: `src/test/ArtworkCard.test.tsx`

**Interfaces:**
- Consumes: `Artwork` type from `@/types` (Task 3), `useLanguage` from `@/lib/language-context` (Task 4).
- Produces: `ArtworkCard({ artwork, onClick }: { artwork: Artwork, onClick?: () => void })`, used by `WorksGallery` (Task 8), `CollectionsGrid`/`CollectionDetail` (Tasks 14-15).

- [ ] **Step 1: Write the failing test `src/test/ArtworkCard.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { ArtworkCard } from '@/components/ui/ArtworkCard'
import type { Artwork } from '@/types'

const sampleArtwork: Artwork = {
  id: 'obra9999',
  type: 'painting',
  img: 'Sample.jpg',
  title: { es: 'Título de Prueba', en: 'Test Title' },
  technique: { es: 'Óleo sobre lienzo', en: 'Oil on canvas' },
  size: '50 × 50 cm',
  year: '2026',
  price: '$500',
  status: 'available',
}

describe('ArtworkCard', () => {
  it('renders the Spanish title, technique, size, and year by default', () => {
    render(
      <LanguageProvider>
        <ArtworkCard artwork={sampleArtwork} />
      </LanguageProvider>
    )
    expect(screen.getByText('Título de Prueba')).toBeInTheDocument()
    expect(screen.getByText('Óleo sobre lienzo')).toBeInTheDocument()
    expect(screen.getByText('50 × 50 cm')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  it('renders a dollar-prefixed price as-is', () => {
    render(
      <LanguageProvider>
        <ArtworkCard artwork={sampleArtwork} />
      </LanguageProvider>
    )
    expect(screen.getByText('$500')).toBeInTheDocument()
  })

  it('renders "Colección Privada" for a sold work whose price says private', () => {
    render(
      <LanguageProvider>
        <ArtworkCard artwork={{ ...sampleArtwork, status: 'sold', price: 'Colección Privada' }} />
      </LanguageProvider>
    )
    expect(screen.getByText('Colección Privada')).toBeInTheDocument()
    expect(screen.getByText('Vendida')).toBeInTheDocument()
  })

  it('shows "Disponible" status label for an available work', () => {
    render(
      <LanguageProvider>
        <ArtworkCard artwork={sampleArtwork} />
      </LanguageProvider>
    )
    expect(screen.getByText('Disponible')).toBeInTheDocument()
  })

  it('calls onClick when the card is clicked', () => {
    const onClick = vi.fn()
    render(
      <LanguageProvider>
        <ArtworkCard artwork={sampleArtwork} onClick={onClick} />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByText('Título de Prueba'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/ArtworkCard.test.tsx`
Expected: FAIL with "Cannot find module '@/components/ui/ArtworkCard'"

- [ ] **Step 3: Create `src/components/ui/ArtworkCard.tsx`**

```tsx
'use client'
import { motion } from 'framer-motion'
import { useLanguage } from '@/lib/language-context'
import type { Artwork } from '@/types'

function formatPrice(price: string): string {
  const lower = price.toLowerCase()
  if (lower.includes('privada') || lower.includes('private')) return price
  if (lower.includes('consultar') || lower.includes('inquire')) return price
  return price.startsWith('$') ? price : `$${price}`
}

export function ArtworkCard({ artwork, onClick }: { artwork: Artwork; onClick?: () => void }) {
  const { language } = useLanguage()

  const statusLabel =
    artwork.status === 'sold'
      ? { es: 'Vendida', en: 'Sold' }
      : { es: 'Disponible', en: 'Available' }

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="group cursor-pointer border border-brand-border bg-brand-card"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/${artwork.img}`}
          alt={artwork.title.es}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="p-4">
        <span className="text-xs uppercase tracking-wide text-brand-accentLight">
          {statusLabel[language]}
        </span>
        <h3 className="font-display text-xl mt-1">{artwork.title[language]}</h3>
        <div className="text-xs text-brand-muted mt-2 space-y-0.5">
          <div>{artwork.technique[language]}</div>
          <div>{artwork.size}</div>
          <div>{artwork.year}</div>
        </div>
        <div className="mt-2 text-sm text-brand-text">{formatPrice(artwork.price)}</div>
      </div>
    </motion.div>
  )
}
```

Note: this uses Framer Motion's mount-triggered `initial`/`animate` (not `whileInView`) — a deliberate simplification to avoid `IntersectionObserver`-in-jsdom flakiness in tests, while still replacing the old hand-rolled `.reveal` class with real Framer Motion. A true scroll-triggered reveal can be swapped in later without changing the component's public interface.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/ArtworkCard.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ArtworkCard.tsx src/test/ArtworkCard.test.tsx
git commit -m "feat: add ArtworkCard component"
```

---

### Task 8: Lightbox component

**Files:**
- Create: `src/components/ui/Lightbox.tsx`
- Test: `src/test/Lightbox.test.tsx`

**Interfaces:**
- Consumes: `Artwork` type from `@/types` (Task 3), `useLanguage` from `@/lib/language-context` (Task 4).
- Produces: `Lightbox({ artwork, onClose }: { artwork: Artwork | null, onClose: () => void })`, used by `WorksGallery` (Task 9).

- [ ] **Step 1: Write the failing test `src/test/Lightbox.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { Lightbox } from '@/components/ui/Lightbox'
import type { Artwork } from '@/types'

const sampleArtwork: Artwork = {
  id: 'obra9999',
  type: 'painting',
  img: 'Sample.jpg',
  title: { es: 'Título de Prueba', en: 'Test Title' },
  technique: { es: 'Óleo sobre lienzo', en: 'Oil on canvas' },
  size: '50 × 50 cm',
  year: '2026',
  price: '$500',
  status: 'available',
}

describe('Lightbox', () => {
  it('renders nothing when artwork is null', () => {
    const { container } = render(
      <LanguageProvider>
        <Lightbox artwork={null} onClose={vi.fn()} />
      </LanguageProvider>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the artwork title and image when artwork is provided', () => {
    render(
      <LanguageProvider>
        <Lightbox artwork={sampleArtwork} onClose={vi.fn()} />
      </LanguageProvider>
    )
    expect(screen.getByText('Título de Prueba')).toBeInTheDocument()
    expect(screen.getByAltText('Título de Prueba')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <LanguageProvider>
        <Lightbox artwork={sampleArtwork} onClose={onClose} />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the overlay background is clicked', () => {
    const onClose = vi.fn()
    render(
      <LanguageProvider>
        <Lightbox artwork={sampleArtwork} onClose={onClose} />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByTestId('lightbox-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/Lightbox.test.tsx`
Expected: FAIL with "Cannot find module '@/components/ui/Lightbox'"

- [ ] **Step 3: Create `src/components/ui/Lightbox.tsx`**

```tsx
'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from '@/lib/language-context'
import type { Artwork } from '@/types'

export function Lightbox({ artwork, onClose }: { artwork: Artwork | null; onClose: () => void }) {
  const { language } = useLanguage()

  return (
    <AnimatePresence>
      {artwork && (
        <motion.div
          data-testid="lightbox-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6"
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-3xl w-full">
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="mb-4 text-brand-text/70 hover:text-brand-text transition-colors"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/${artwork.img}`}
              alt={artwork.title[language]}
              className="w-full max-h-[75vh] object-contain"
            />
            <h3 className="font-display text-2xl mt-4">{artwork.title[language]}</h3>
            <p className="text-brand-muted text-sm mt-1">{artwork.technique[language]}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/Lightbox.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Lightbox.tsx src/test/Lightbox.test.tsx
git commit -m "feat: add Lightbox component"
```

---

### Task 9: WorksGallery component (filters + grid + lightbox wiring)

**Files:**
- Create: `src/components/sections/WorksGallery.tsx`
- Test: `src/test/WorksGallery.test.tsx`

**Interfaces:**
- Consumes: `artworks` from `@/data/artworks` (Task 3), `useLanguage` (Task 4), `ArtworkCard` (Task 7), `Lightbox` (Task 8).
- Produces: `WorksGallery` component, used in Task 13's home page.

- [ ] **Step 1: Write the failing test `src/test/WorksGallery.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { WorksGallery } from '@/components/sections/WorksGallery'

function renderGallery() {
  return render(
    <LanguageProvider>
      <WorksGallery />
    </LanguageProvider>
  )
}

describe('WorksGallery', () => {
  it('shows only paintings by default', () => {
    renderGallery()
    expect(screen.getByText('Anhelo')).toBeInTheDocument()
    expect(screen.queryByText('Estudio de Movimiento')).not.toBeInTheDocument()
  })

  it('shows drawings when the Dibujos filter is clicked', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Dibujos' }))
    expect(screen.getByText('Estudio de Movimiento')).toBeInTheDocument()
    expect(screen.queryByText('Anhelo')).not.toBeInTheDocument()
  })

  it('filters to only available works when Disponibles is clicked', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Disponibles' }))
    expect(screen.getByText('Volumen Esencial')).toBeInTheDocument()
    expect(screen.queryByText('Anhelo')).not.toBeInTheDocument()
  })

  it('filters to only sold works when Vendidas is clicked', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Vendidas' }))
    expect(screen.getByText('Anhelo')).toBeInTheDocument()
    expect(screen.queryByText('Volumen Esencial')).not.toBeInTheDocument()
  })

  it('opens the lightbox when a card is clicked', () => {
    renderGallery()
    fireEvent.click(screen.getByText('Anhelo'))
    expect(screen.getByRole('button', { name: /cerrar/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/WorksGallery.test.tsx`
Expected: FAIL with "Cannot find module '@/components/sections/WorksGallery'"

- [ ] **Step 3: Create `src/components/sections/WorksGallery.tsx`**

```tsx
'use client'
import { useState, useMemo } from 'react'
import { artworks } from '@/data/artworks'
import { useLanguage } from '@/lib/language-context'
import { ArtworkCard } from '@/components/ui/ArtworkCard'
import { Lightbox } from '@/components/ui/Lightbox'
import type { Artwork } from '@/types'

type TypeFilter = 'painting' | 'drawing'
type StatusFilter = 'all' | 'available' | 'sold'

const typeFilters: { value: TypeFilter; label: { es: string; en: string } }[] = [
  { value: 'painting', label: { es: 'Pinturas', en: 'Paintings' } },
  { value: 'drawing', label: { es: 'Dibujos', en: 'Drawings' } },
]

const statusFilters: { value: StatusFilter; label: { es: string; en: string } }[] = [
  { value: 'all', label: { es: 'Todas', en: 'All' } },
  { value: 'available', label: { es: 'Disponibles', en: 'Available' } },
  { value: 'sold', label: { es: 'Vendidas', en: 'Sold' } },
]

export function WorksGallery() {
  const { language } = useLanguage()
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('painting')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedWork, setSelectedWork] = useState<Artwork | null>(null)

  const filtered = useMemo(
    () =>
      artworks.filter(
        (work) =>
          work.type === typeFilter &&
          (statusFilter === 'all' || work.status === statusFilter)
      ),
    [typeFilter, statusFilter]
  )

  return (
    <section id="obras" className="max-w-[1440px] mx-auto px-6 md:px-10 py-16">
      <div className="text-xs uppercase tracking-widest text-brand-accentLight mb-6">
        {language === 'es' ? 'Portafolio' : 'Portfolio'}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex gap-2">
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setTypeFilter(filter.value)}
              className={
                typeFilter === filter.value
                  ? 'px-4 py-2 text-sm bg-brand-accent text-brand-text'
                  : 'px-4 py-2 text-sm text-brand-muted hover:text-brand-text transition-colors'
              }
            >
              {filter.label[language]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={
                statusFilter === filter.value
                  ? 'px-4 py-2 text-sm bg-brand-accent text-brand-text'
                  : 'px-4 py-2 text-sm text-brand-muted hover:text-brand-text transition-colors'
              }
            >
              {filter.label[language]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((work) => (
          <ArtworkCard key={work.id} artwork={work} onClick={() => setSelectedWork(work)} />
        ))}
      </div>

      <Lightbox artwork={selectedWork} onClose={() => setSelectedWork(null)} />
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/WorksGallery.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/WorksGallery.tsx src/test/WorksGallery.test.tsx
git commit -m "feat: add WorksGallery component with type/status filters and lightbox"
```

---

### Task 10: HeroSlideshow component

**Files:**
- Create: `src/components/sections/HeroSlideshow.tsx`
- Test: `src/test/HeroSlideshow.test.tsx`

**Interfaces:**
- Consumes: `artworks` from `@/data/artworks` (Task 3), `heroContent`, `siteConfig` from `@/data/site` (Task 3), `useLanguage` (Task 4).
- Produces: `HeroSlideshow` component, used in Task 13's home page.

- [ ] **Step 1: Write the failing test `src/test/HeroSlideshow.test.tsx`**

```tsx
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { HeroSlideshow } from '@/components/sections/HeroSlideshow'

describe('HeroSlideshow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the artist name and tagline', () => {
    render(
      <LanguageProvider>
        <HeroSlideshow />
      </LanguageProvider>
    )
    expect(screen.getByText('Daniel')).toBeInTheDocument()
    expect(screen.getByText('Grimaldi')).toBeInTheDocument()
    expect(screen.getByText('Pintura que habita el territorio del anhelo.')).toBeInTheDocument()
  })

  it('renders exactly one active background slide', () => {
    render(
      <LanguageProvider>
        <HeroSlideshow />
      </LanguageProvider>
    )
    const slides = screen.getAllByTestId('hero-slide')
    expect(slides).toHaveLength(1)
    expect(slides[0].style.backgroundImage).toMatch(/^url\(\/.+\.jpg\)$/)
  })

  it('advances to a different background image after 5 seconds', () => {
    render(
      <LanguageProvider>
        <HeroSlideshow />
      </LanguageProvider>
    )
    const before = screen.getByTestId('hero-slide').style.backgroundImage

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    const after = screen.getByTestId('hero-slide').style.backgroundImage
    expect(after).not.toBe(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/HeroSlideshow.test.tsx`
Expected: FAIL with "Cannot find module '@/components/sections/HeroSlideshow'"

- [ ] **Step 3: Create `src/components/sections/HeroSlideshow.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { artworks } from '@/data/artworks'
import { heroContent, siteConfig } from '@/data/site'
import { useLanguage } from '@/lib/language-context'

const SLIDE_INTERVAL_MS = 5000

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function HeroSlideshow() {
  const { language } = useLanguage()
  // Deterministic initial order (matches server render) — shuffled client-side
  // after mount in the effect below, so hydration never mismatches.
  const [images, setImages] = useState(() => artworks.map((a) => a.img))
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setImages(shuffle(artworks.map((a) => a.img)))
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length)
    }, SLIDE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [images.length])

  return (
    <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden text-center">
      <div className="absolute inset-0">
        <motion.div
          key={images[activeIndex]}
          data-testid="hero-slide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(/${images[activeIndex]})` }}
        />
        <div className="absolute inset-0 bg-brand-black/60" />
      </div>

      <div className="relative z-10 px-6">
        <p className="text-sm uppercase tracking-widest text-brand-accentLight mb-4">
          {heroContent.eyebrow[language]}
        </p>
        <h1 className="font-display text-6xl md:text-8xl">
          Daniel
          <br />
          <em className="italic">Grimaldi</em>
        </h1>
        <div className="w-16 h-px bg-brand-accent mx-auto my-6" />
        <p className="text-lg text-brand-text/80">{siteConfig.tagline[language]}</p>
      </div>
    </section>
  )
}
```

Note: a single `motion.div` re-keyed by the active image (rather than one layer per image crossfading via `AnimatePresence`) — Framer Motion still replays `initial`→`animate` on every key change, giving a real fade transition without `AnimatePresence`'s exit-animation complexity, which keeps the test above simple and deterministic (only one `hero-slide` element ever exists, so there's nothing to mock).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/HeroSlideshow.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/HeroSlideshow.tsx src/test/HeroSlideshow.test.tsx
git commit -m "feat: add HeroSlideshow component"
```

---

### Task 11: BioSection component

**Files:**
- Create: `src/components/sections/BioSection.tsx`
- Test: `src/test/BioSection.test.tsx`

**Interfaces:**
- Consumes: `bio` from `@/data/site` (Task 3), `useLanguage` (Task 4).
- Produces: `BioSection` component, used in Task 13's home page.

- [ ] **Step 1: Write the failing test `src/test/BioSection.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import { BioSection } from '@/components/sections/BioSection'

describe('BioSection', () => {
  it('renders the Spanish bio paragraphs by default', () => {
    render(
      <LanguageProvider>
        <BioSection />
      </LanguageProvider>
    )
    expect(screen.getByText(/Daniel Grimaldi Assef \(Valencia, Venezuela, 2001\) es un artista visual/)).toBeInTheDocument()
  })

  it('renders the English bio paragraphs after toggling language', () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
        <BioSection />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText(/Daniel Grimaldi Assef \(Valencia, Venezuela, 2001\) is a visual artist/)).toBeInTheDocument()
  })

  it('renders the role and location', () => {
    render(
      <LanguageProvider>
        <BioSection />
      </LanguageProvider>
    )
    expect(screen.getByText('Artista Plástico')).toBeInTheDocument()
    expect(screen.getByText('Valencia, Venezuela')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/BioSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/sections/BioSection'"

- [ ] **Step 3: Create `src/components/sections/BioSection.tsx`**

```tsx
'use client'
import { bio } from '@/data/site'
import { useLanguage } from '@/lib/language-context'

export function BioSection() {
  const { language } = useLanguage()

  return (
    <section id="bio" className="max-w-[1440px] mx-auto px-6 md:px-10 py-16 grid md:grid-cols-[1fr_2fr_1fr] gap-10">
      <div className="aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/foto bio.jpg" alt="Daniel Grimaldi en su taller" className="w-full h-full object-cover" />
      </div>

      <div className="space-y-4 text-brand-text/90">
        {bio.paragraphs.map((paragraph) => (
          <p key={paragraph.es}>{paragraph[language]}</p>
        ))}
      </div>

      <div>
        <h2 className="font-display text-3xl">
          Daniel
          <br />
          <em className="italic">Grimaldi</em>
        </h2>
        <div className="mt-4 text-sm text-brand-muted space-y-1">
          <div>{bio.role[language]}</div>
          <div>{bio.location}</div>
        </div>
        <div className="mt-4 text-xs text-brand-accentLight">{bio.since}</div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/BioSection.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/BioSection.tsx src/test/BioSection.test.tsx
git commit -m "feat: add BioSection component"
```

---

### Task 12: ContactSection component

**Files:**
- Create: `src/components/sections/ContactSection.tsx`
- Test: `src/test/ContactSection.test.tsx`

**Interfaces:**
- Consumes: `siteConfig` from `@/data/site` (Task 3), `useLanguage` (Task 4).
- Produces: `ContactSection` component, used in Task 13's home page.

- [ ] **Step 1: Write the failing test `src/test/ContactSection.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { ContactSection } from '@/components/sections/ContactSection'

describe('ContactSection', () => {
  it('renders a mailto link with the correct address', () => {
    render(
      <LanguageProvider>
        <ContactSection />
      </LanguageProvider>
    )
    const emailLink = screen.getByRole('link', { name: /danieco.comics@gmail.com/ })
    expect(emailLink).toHaveAttribute('href', 'mailto:danieco.comics@gmail.com')
  })

  it('renders a tel link with the correct number', () => {
    render(
      <LanguageProvider>
        <ContactSection />
      </LanguageProvider>
    )
    const phoneLink = screen.getByRole('link', { name: /04244-359019/ })
    expect(phoneLink).toHaveAttribute('href', 'tel:04244359019')
  })

  it('renders both Instagram links', () => {
    render(
      <LanguageProvider>
        <ContactSection />
      </LanguageProvider>
    )
    expect(screen.getByRole('link', { name: /@daniel_grimaldi/ })).toHaveAttribute(
      'href',
      'https://instagram.com/daniel_grimaldi'
    )
    expect(screen.getByRole('link', { name: /@grim4rt_/ })).toHaveAttribute(
      'href',
      'https://instagram.com/grim4rt_'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/ContactSection.test.tsx`
Expected: FAIL with "Cannot find module '@/components/sections/ContactSection'"

- [ ] **Step 3: Create `src/components/sections/ContactSection.tsx`**

```tsx
'use client'
import { siteConfig } from '@/data/site'
import { useLanguage } from '@/lib/language-context'

export function ContactSection() {
  const { language } = useLanguage()

  return (
    <section id="contacto" className="max-w-[1440px] mx-auto px-6 md:px-10 py-16 text-center">
      <div className="text-xs uppercase tracking-widest text-brand-accentLight mb-4">
        {language === 'es' ? 'Contacto' : 'Contact'}
      </div>
      <h2 className="font-display text-4xl mb-10">
        {language === 'es' ? (
          <>¿Interesado en una <em className="italic">obra?</em></>
        ) : (
          <>Interested in a <em className="italic">piece?</em></>
        )}
      </h2>
      <div className="flex flex-wrap justify-center gap-6 text-sm">
        <a href={`mailto:${siteConfig.email}`} className="hover:text-brand-accentLight transition-colors">
          📧 {siteConfig.email}
        </a>
        <a href={`tel:${siteConfig.phone.replace(/\D/g, '')}`} className="hover:text-brand-accentLight transition-colors">
          📞 Tel: {siteConfig.phone}
        </a>
        <a href={siteConfig.instagramPersonal} target="_blank" rel="noopener noreferrer" className="hover:text-brand-accentLight transition-colors">
          🎨 @daniel_grimaldi
        </a>
        <a href={siteConfig.instagramStudio} target="_blank" rel="noopener noreferrer" className="hover:text-brand-accentLight transition-colors">
          💼 @grim4rt_
        </a>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/ContactSection.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/ContactSection.tsx src/test/ContactSection.test.tsx
git commit -m "feat: add ContactSection component"
```

---

### Task 13: Assemble the home page

**Files:**
- Modify: `src/app/page.tsx` (replace Task 2's placeholder)

**Interfaces:**
- Consumes: `Navbar` (Task 5), `Footer`/`WhatsAppButton` (Task 6), `HeroSlideshow` (Task 10), `WorksGallery` (Task 9), `BioSection` (Task 11), `ContactSection` (Task 12).
- Produces: the real `/` route.

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'
import { HeroSlideshow } from '@/components/sections/HeroSlideshow'
import { WorksGallery } from '@/components/sections/WorksGallery'
import { BioSection } from '@/components/sections/BioSection'
import { ContactSection } from '@/components/sections/ContactSection'

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSlideshow />
        <WorksGallery />
        <BioSection />
        <ContactSection />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm run test:run`
Expected: all tests from Tasks 3-12 still PASS (no test targets `page.tsx` directly; this step catches any accidental regression in the components it composes).

- [ ] **Step 3: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds with `/` listed as a route.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open `http://localhost:3000` in a browser. Confirm: hero slideshow renders and crossfades, Obras gallery shows paintings by default with working filters, clicking a card opens the lightbox, Sobre mí shows the bio photo and text, Contacto shows all four links, WhatsApp button is fixed bottom-right, language toggle switches all visible text.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: assemble home page from Navbar, Hero, Gallery, Bio, and Contact sections"
```

---

### Task 14: Collections grid page

**Files:**
- Create: `src/components/collections/CollectionsGrid.tsx`
- Create: `src/app/colecciones/page.tsx`
- Test: `src/test/CollectionsGrid.test.tsx`

**Interfaces:**
- Consumes: `collections` from `@/data/collections` (Task 3), `useLanguage` (Task 4), `Navbar`/`Footer`/`WhatsAppButton` (Tasks 5-6).
- Produces: `CollectionsGrid` component and the real `/colecciones` route, used by Task 15's back-link.

- [ ] **Step 1: Write the failing test `src/test/CollectionsGrid.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { CollectionsGrid } from '@/components/collections/CollectionsGrid'

describe('CollectionsGrid', () => {
  it('renders all four collection names in Spanish by default', () => {
    render(
      <LanguageProvider>
        <CollectionsGrid />
      </LanguageProvider>
    )
    expect(screen.getByText('Toros')).toBeInTheDocument()
    expect(screen.getByText('Bailarinas')).toBeInTheDocument()
    expect(screen.getByText('Figura Humana')).toBeInTheDocument()
    expect(screen.getByText('Estudios')).toBeInTheDocument()
  })

  it('links each collection card to its detail route', () => {
    render(
      <LanguageProvider>
        <CollectionsGrid />
      </LanguageProvider>
    )
    expect(screen.getByText('Figura Humana').closest('a')).toHaveAttribute(
      'href',
      '/colecciones/figura-humana'
    )
  })

  it('shows the work count for each collection', () => {
    render(
      <LanguageProvider>
        <CollectionsGrid />
      </LanguageProvider>
    )
    expect(screen.getByText('2 obras')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/CollectionsGrid.test.tsx`
Expected: FAIL with "Cannot find module '@/components/collections/CollectionsGrid'"

- [ ] **Step 3: Create `src/components/collections/CollectionsGrid.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { collections } from '@/data/collections'
import { useLanguage } from '@/lib/language-context'

export function CollectionsGrid() {
  const { language } = useLanguage()

  return (
    <section className="max-w-[1440px] mx-auto px-6 md:px-10 py-16">
      <div className="text-xs uppercase tracking-widest text-brand-accentLight mb-4">
        {language === 'es' ? 'Explorar' : 'Explore'}
      </div>
      <h1 className="font-display text-4xl mb-10">
        <em className="italic">{language === 'es' ? 'Colecciones' : 'Collections'}</em>
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {collections.map((collection) => (
          <Link
            key={collection.slug}
            href={`/colecciones/${collection.slug}`}
            className="group block border border-brand-border bg-brand-card"
          >
            <div className="aspect-[4/3] overflow-hidden bg-brand-dark">
              {collection.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/${collection.cover}`}
                  alt={collection.name.es}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </div>
            <div className="p-4">
              <h3 className="font-display text-xl">{collection.name[language]}</h3>
              <p className="text-xs text-brand-muted mt-1">
                {collection.workIds.length} {language === 'es' ? 'obras' : 'works'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/CollectionsGrid.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Create `src/app/colecciones/page.tsx`**

```tsx
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'
import { CollectionsGrid } from '@/components/collections/CollectionsGrid'

export default function CollectionsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24">
        <CollectionsGrid />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}
```

- [ ] **Step 6: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds with `/colecciones` listed as a route.

- [ ] **Step 7: Commit**

```bash
git add src/components/collections/CollectionsGrid.tsx src/app/colecciones/page.tsx src/test/CollectionsGrid.test.tsx
git commit -m "feat: add collections grid page at /colecciones"
```

---

### Task 15: Collection detail page

**Files:**
- Create: `src/components/collections/CollectionDetail.tsx`
- Create: `src/app/colecciones/[slug]/page.tsx`
- Test: `src/test/CollectionDetail.test.tsx`

**Interfaces:**
- Consumes: `collections` from `@/data/collections`, `artworks` from `@/data/artworks` (Task 3), `useLanguage` (Task 4), `ArtworkCard` (Task 7), `BackButton` (Task 6).
- Produces: `CollectionDetail` component and the real `/colecciones/[slug]` route.

- [ ] **Step 1: Write the failing test `src/test/CollectionDetail.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { CollectionDetail } from '@/components/collections/CollectionDetail'

describe('CollectionDetail', () => {
  it('renders the collection name and work count', () => {
    render(
      <LanguageProvider>
        <CollectionDetail slug="figura-humana" />
      </LanguageProvider>
    )
    expect(screen.getByText('Figura Humana')).toBeInTheDocument()
    expect(screen.getByText('2 obras en esta colección')).toBeInTheDocument()
  })

  it("renders each of the collection's artworks", () => {
    render(
      <LanguageProvider>
        <CollectionDetail slug="figura-humana" />
      </LanguageProvider>
    )
    expect(screen.getByText('Anhelo')).toBeInTheDocument()
    expect(screen.getByText('Volumen Esencial')).toBeInTheDocument()
  })

  it('renders a back link to /colecciones', () => {
    render(
      <LanguageProvider>
        <CollectionDetail slug="figura-humana" />
      </LanguageProvider>
    )
    expect(screen.getByText(/Volver a Colecciones/).closest('a')).toHaveAttribute(
      'href',
      '/colecciones'
    )
  })

  it('renders an empty-state message for a collection with no works', () => {
    render(
      <LanguageProvider>
        <CollectionDetail slug="toros" />
      </LanguageProvider>
    )
    expect(screen.getByText('Esta colección aún no tiene obras.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/test/CollectionDetail.test.tsx`
Expected: FAIL with "Cannot find module '@/components/collections/CollectionDetail'"

- [ ] **Step 3: Create `src/components/collections/CollectionDetail.tsx`**

```tsx
'use client'
import { collections } from '@/data/collections'
import { artworks } from '@/data/artworks'
import { useLanguage } from '@/lib/language-context'
import { ArtworkCard } from '@/components/ui/ArtworkCard'
import { BackButton } from '@/components/ui/BackButton'

export function CollectionDetail({ slug }: { slug: string }) {
  const { language } = useLanguage()
  const collection = collections.find((c) => c.slug === slug)

  if (!collection) return null

  const works = collection.workIds
    .map((id) => artworks.find((a) => a.id === id))
    .filter((work): work is NonNullable<typeof work> => Boolean(work))

  return (
    <section className="max-w-[1440px] mx-auto px-6 md:px-10 py-16">
      <BackButton href="/colecciones" label={language === 'es' ? 'Volver a Colecciones' : 'Back to Collections'} />

      <h1 className="font-display text-4xl mt-6">{collection.name[language]}</h1>
      <p className="text-sm text-brand-muted mt-2">
        {language === 'es'
          ? `${works.length} obras en esta colección`
          : `${works.length} works in this collection`}
      </p>

      {works.length === 0 ? (
        <p className="mt-10 text-brand-muted italic">
          {language === 'es' ? 'Esta colección aún no tiene obras.' : 'This collection has no works yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
          {works.map((work) => (
            <ArtworkCard key={work.id} artwork={work} />
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/test/CollectionDetail.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Create `src/app/colecciones/[slug]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'
import { CollectionDetail } from '@/components/collections/CollectionDetail'
import { collections } from '@/data/collections'

export function generateStaticParams() {
  return collections.map((collection) => ({ slug: collection.slug }))
}

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const exists = collections.some((c) => c.slug === slug)
  if (!exists) notFound()

  return (
    <>
      <Navbar />
      <main className="pt-24">
        <CollectionDetail slug={slug} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}
```

- [ ] **Step 6: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds with `/colecciones/[slug]` listed as a route, pre-rendering 4 static params (`toros`, `bailarinas`, `figura-humana`, `estudios`).

- [ ] **Step 7: Commit**

```bash
git add src/components/collections/CollectionDetail.tsx src/app/colecciones/[slug]/page.tsx src/test/CollectionDetail.test.tsx
git commit -m "feat: add collection detail page at /colecciones/[slug]"
```

---

### Task 16: Move images into `public/` and remove the old static site's root clutter

**Files:**
- Move: all `*.jpg` files and `foto bio.jpg` from repo root to `public/`
- Modify: `src/app/favicon.ico` (create from the emoji favicon used today, or a simple placeholder)

**Interfaces:**
- Produces: every `/<filename>.jpg` URL referenced by Tasks 7-15's `img src="/${artwork.img}"` and `src="/foto bio.jpg"`.

- [ ] **Step 1: Move images into `public/`**

Run:
```bash
mkdir -p public
git mv Alanna.jpg Anhelo.jpg Antes_del_Escenario.jpg Bailaora.jpg Bailarina.jpg Bailarina2.jpg Boat.jpg Boceto.jpg Caballo.jpg Caballo2.jpg Caballo3.jpg Caballo4.jpg Caballo5.jpg Copa.jpg Dancing.jpg Estudio_de_Movimiento.jpg Firme.jpg Flores.jpg Gorilla.jpg Impetu.jpg Losroques.jpg Mirada_Intrapersonal.jpg Mono.jpg Mono2.jpg Mono3.jpg Morocho.jpg Morocho2.jpg Payaso.jpg Payaso2.jpg Saltoangel.jpg Sancharbel.jpg Sancharbel2.jpg Sancharbel3.jpg Sanmiguel.jpg Sebu.jpg Silence.jpg Sintitulo.jpg Sintitulo2.jpg Sintitulo3.jpg Sintitulo4.jpg Sombrero.jpg Theheartsheavyness.jpg Torero.jpg Toro.jpg Toro2.jpg Toro3.jpg Virgen.jpg Volumen_Esencial.jpg Whiskey.jpg obra_principal.jpg "foto bio.jpg" public/
```
Expected: all 51 files now under `public/`, `git status` shows them as renames.

- [ ] **Step 2: Verify every referenced image exists in `public/`**

Run:
```bash
for f in $(grep -oE "img: '[^']+\.jpg'" src/data/artworks.ts | sed "s/img: '//;s/'$//"); do
  [ -f "public/$f" ] || echo "MISSING: $f"
done
```
Expected: no output (every referenced image exists in `public/`).

- [ ] **Step 3: Verify the build succeeds and images resolve**

Run: `npm run build`
Expected: build succeeds. Then `npm run dev`, open `http://localhost:3000`, confirm artwork thumbnails, hero slideshow backgrounds, and the bio photo all render (no broken-image icons).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: move artwork images into public/ for Next.js static serving"
```

---

### Task 17: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`
Expected: every test file from Tasks 3-15 passes (data, LanguageToggle, Navbar, Footer, WhatsAppButton, ArtworkCard, Lightbox, WorksGallery, HeroSlideshow, BioSection, ContactSection, CollectionsGrid, CollectionDetail).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors (warnings acceptable if they pre-exist in `eslint-config-next` defaults; fix anything flagged in code written by this plan).

- [ ] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds, listing routes `/`, `/colecciones`, `/colecciones/[slug]` (4 static params).

- [ ] **Step 4: Manual acceptance checklist against the live `main` site**

With `npm run start` running the production build, compare side-by-side against `https://danielgrimi.github.io/Grim4rt/` for each of:
- [ ] Hero: name, tagline, eyebrow text, background slideshow all present
- [ ] Obras: Pinturas selected by default, Dibujos filter shows the 2 drawings, Disponibles/Vendidas/Todas filters work
- [ ] Clicking any artwork card opens the lightbox with full image + title + technique
- [ ] Sobre mí: photo + both bio paragraphs + role/location/since
- [ ] Contacto: all four links (email, phone, 2x Instagram) present and correctly targeted
- [ ] Colecciones grid shows all 4 collections with correct work counts
- [ ] Each collection detail page shows its works (or the empty-state message for Toros/Bailarinas)
- [ ] Language toggle switches every piece of visible text between ES and EN
- [ ] WhatsApp floating button present and links to `https://wa.me/584244359019`
- [ ] No admin button, no login overlay anywhere (intentionally removed)

- [ ] **Step 5: Commit the plan's completion**

```bash
git add docs/superpowers/plans/2026-07-08-nextjs-rebuild.md
git commit -m "docs: mark Next.js rebuild plan complete" --allow-empty
```

(No further action — deployment/cutover is explicitly out of scope for this plan, per the approved spec's "Out of scope" section.)
