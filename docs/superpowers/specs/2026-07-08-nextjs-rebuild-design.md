# Grim4rt Next.js Rebuild — Design

## Context

Grim4rt is Daniel Grimaldi's bilingual (ES/EN) art portfolio site, currently a single
1725-line `index.html` with all markup, CSS, and JS inlined. Artwork/collection data
lives in a hardcoded JS object (`baseWorks`), and a client-only "admin" panel lets a
visitor add/edit/delete works — but it only persists to that visitor's own
`localStorage`, so edits never reach real visitors. The site is deployed via GitHub
Pages (branch-based, serving `main` directly).

This rebuild ports the site onto a proper, maintainable base — the same stack and
folder conventions already validated on the INDOTEL project
(`/Users/armandosilva/Desktop/INDOTEL/indotel`) — because this site is expected to be
deployed for real, long-term use, not stay a quick static hack.

## Goals

- Faithful port of current content/sections/behavior — no redesign in this phase.
- Replace ad hoc inline JS with typed, component-based React code.
- Replace the broken localStorage "admin" panel with static typed data files as the
  source of truth (edited directly, redeployed on change).
- Give Colecciones real URLs instead of JS-faked page-switching.
- Keep the base portable — not locked into GitHub Pages' static-only hosting — so it
  can go to Vercel, a custom domain, or wherever, when ready to go live for real.

## Non-goals (this phase)

- Visual or content redesign.
- Any CMS/backend for content editing.
- Actually cutting real traffic over to the new base — this branch (`rebuild/nextjs`)
  is built and verified locally; `main` (the live GitHub Pages static site) stays
  untouched until a deliberate, separate cutover decision.

## Stack

Matches INDOTEL exactly:
- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS
- Framer Motion (replaces today's hand-rolled scroll-reveal/hero-slideshow JS)
- Vitest + Testing Library + jsdom
- ESLint

## Routing

Today's "pages" are faked via `showPage('home' | 'collections')` toggling `display`,
so Colecciones has no real URL. Replaced with real App Router routes:

- `/` — hero, Obras gallery (Pinturas/Dibujos × Disponible/Vendida/Todas filters),
  Sobre mí, Contacto
- `/colecciones` — collections grid
- `/colecciones/[slug]` — one collection's detail gallery

Lightbox, WhatsApp button, and back-navigation remain overlay UI on top of whichever
route is active, matching current behavior.

## Data layer (`src/data/`)

- `artworks.ts` — typed `Artwork[]`, replaces `baseWorks`. Fields: `id`, `type`
  (`'painting' | 'drawing'`), `img`, `title: { es, en }`, `technique: { es, en }`,
  `size`, `year`, `price`, `status` (`'available' | 'sold'`).
- `collections.ts` — typed `Collection[]`, replaces `defaultCollections`. Fields:
  `slug`, `name: { es, en }`, `cover`, `workIds: string[]`.
- `site.ts` — bio text (es/en), contact info, nav labels — same pattern as INDOTEL's
  `site.ts`.

No admin UI, no localStorage persistence. Content changes = editing these files.

## Components (`src/components/`)

- `layout/`: `Navbar`, `Footer`, `WhatsAppButton`, `LanguageToggle`
- `sections/`: `HeroSlideshow`, `WorksGallery` (filters + grid), `BioSection`,
  `ContactSection`
- `collections/`: `CollectionsGrid`, `CollectionDetail`
- `ui/`: `ArtworkCard`, `Lightbox`, `BackButton`

Each component owns its own local state (e.g. gallery filter state lives in
`WorksGallery`, lightbox open/close lives in `Lightbox`). No global state library —
matches the user's own patterns guidance against introducing state management
machinery the app doesn't need.

## Bilingual (ES/EN) toggle

A `LanguageProvider` (React Context) wraps the root layout, holding
`'es' | 'en'` + `setLanguage`. Components call `useLanguage()` and read `.es`/`.en`
off data objects. Same instant, same-page toggle UX as today — just done via context
instead of `data-es`/`data-en` HTML attributes and manual DOM text-swapping.

## Testing

Mirrors INDOTEL's `src/test/` approach: component tests for `ArtworkCard`,
`WorksGallery` (filter logic), `Navbar`, `LanguageToggle`, `ContactSection`. Coverage
targets the logic that can actually break (filters, language switching), not a
percentage for its own sake.

## Images

Existing converted JPEGs (already real JPEGs as of the `fix/heic-images-and-onerror`
work on `main`) move into `public/` per Next.js convention. `next/image` used where
it's a clean fit; final optimization-loader decision (default vs. `unoptimized`)
depends on the eventual hosting target, decided at cutover time — not blocking this
phase since we're not deploying yet.

## Open items for later (explicitly deferred, not blocking this spec)

- Hosting/deployment target for going live for real (Vercel vs. GitHub Pages static
  export vs. other) — deferred until the base is built and the user is ready to cut
  over.
- Whatever eventually replaces the admin panel for non-technical content edits, if
  Daniel wants one later (a proper CMS) — out of scope for this rebuild.
