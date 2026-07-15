# Grim4rt Admin Panel — Design

## Context

Grim4rt's content (49 artworks, 4 collections, bio/contact info) lives in hardcoded
typed files under `src/data/`, edited directly and redeployed on change — a
deliberate non-goal from the [Next.js rebuild](2026-07-08-nextjs-rebuild-design.md)
("Any CMS/backend for content editing"). That constraint is now lifted: Daniel wants
to manage artworks, collections, and site info himself, without a redeploy per change.

The site deploys to Vercel, whose filesystem is read-only at runtime, so content can
no longer live in repo files — it needs a real database and file storage.

## Goals

- Single-admin panel (Daniel only, no multi-user accounts) to create/edit/delete
  artworks, manage collections and their artwork assignments, and edit site info
  (contact details, tagline, bio).
- Public pages stay statically fast — database reads are cached and don't happen on
  every visitor request — but reflect admin edits within seconds via targeted cache
  invalidation.
- Existing public components keep their current prop shapes wherever possible; the
  admin panel is additive, not a rewrite of the public site.

## Non-goals

- Multi-user accounts, roles, or permissions.
- Editing nav labels or the hero eyebrow text — structural copy that doesn't change;
  keeping it hardcoded avoids turning a small art portfolio into a general CMS.
- Drag-and-drop reordering UI (artwork/collection ordering is managed via a numeric
  `displayOrder`/`position` field with move-up/move-down controls, not a DnD library).
- Image editing/cropping in the browser — uploads are used as-is.

## Stack additions

- **Supabase**: Postgres database + a public-read Storage bucket (`artwork-images`)
  for artwork and bio photos.
- **Prisma 7** with the `@prisma/adapter-pg` driver adapter and `prisma.config.ts`
  (see "Two database connections" below) — migrations, typed client, Prisma Studio
  as a database GUI.
- **Zod** for validating all Server Action inputs.
- **jose** for signing/verifying the admin session cookie.
- An Argon2 library (e.g. `@node-rs/argon2`) for password hashing.

## Auth & security

Single shared admin password — no user table.

- `ADMIN_PASSWORD_HASH` (env var): an Argon2 hash of the admin password, generated
  once via a small local script. Never stored or compared in plaintext.
- `SESSION_SECRET` (env var): separate secret used only to sign session tokens via
  `jose` (HS256 JWT: `{ role: 'admin', iat, exp }`).
- Login (`/admin/login`, Server Action `login(password)`):
  1. Rate-limit check first (see below).
  2. Verify `password` against `ADMIN_PASSWORD_HASH` with Argon2.
  3. On success, sign a session JWT (8-hour expiry) and set it as an HTTP-only,
     `Secure` (production), `SameSite=Lax` cookie.
  4. On failure, record the attempt and return a generic error (no distinction
     between "wrong password" and "rate limited" beyond the retry message).
- Logout (`logoutAction`): clears the session cookie.
- **`proxy.ts`** (replaces the deprecated `middleware.ts` convention in Next.js 16,
  runs in the Node.js runtime by default): matches `/admin/:path*` except
  `/admin/login`, does a fast, lightweight check that a session cookie is *present*,
  and redirects to `/admin/login` if it's missing entirely. It does **not** verify
  the token's signature or expiry — that's deliberately left to two independent,
  authoritative checks:
  - **`/admin/layout.tsx`** (a Server Component wrapping every admin page) calls
    `requireAdmin()` and redirects to `/admin/login` if the cookie is present but
    invalid or expired. This is what actually protects page loads — `proxy.ts` only
    short-circuits the common case (no cookie) before a page even starts rendering.
  - **Every Server Action** under `/admin` calls `requireAdmin()` independently as
    its first line, since Server Actions are externally reachable POST endpoints
    regardless of what `proxy.ts` or the layout do.
- **`requireAdmin()`** (`src/lib/auth.ts`): reads and verifies the session cookie via
  `jose`, throwing if missing/invalid/expired.
- **Login rate limiting**: a `LoginAttempt { id, ipAddress, attemptedAt }` table
  (DB-backed so it works across serverless instances), with an index on
  `(ipAddress, attemptedAt)`. `ipAddress` is read from the `x-forwarded-for` header
  (the client IP Vercel's edge network sets on incoming requests). Before verifying
  a password: delete that IP's attempts older than the 15-minute window (keeps the
  table bounded without a separate cleanup job), then count what's left; reject with
  a "too many attempts" error above 5, otherwise record the new attempt.

## Database schema (Prisma)

```prisma
model Artwork {
  id            String   @id @default(cuid())
  type          ArtworkType
  imagePath     String   // Supabase Storage object path, not a full URL
  titleEs       String
  titleEn       String
  techniqueEs   String
  techniqueEn   String
  size          String
  year          String
  price         String
  status        ArtworkStatus @default(AVAILABLE)
  displayOrder  Int
  isPublished   Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  collections   CollectionArtwork[]
  coverFor      Collection[] @relation("CollectionCover")
}

model Collection {
  id              String   @id @default(cuid())
  slug            String   @unique
  nameEs          String
  nameEn          String
  displayOrder    Int
  coverArtworkId  String?
  coverArtwork    Artwork? @relation("CollectionCover", fields: [coverArtworkId], references: [id], onDelete: SetNull)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  artworks        CollectionArtwork[]
}

model CollectionArtwork {
  collectionId String
  artworkId    String
  position     Int
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  artwork      Artwork    @relation(fields: [artworkId], references: [id], onDelete: Cascade)

  @@id([collectionId, artworkId])
}

model SiteConfig {
  id                  Int     @id @default(1)
  name                String
  taglineEs           String
  taglineEn           String
  email               String
  phone               String
  whatsapp            String
  instagramPersonal   String
  instagramStudio     String
  bioRoleEs           String
  bioRoleEn           String
  bioLocation         String
  bioSince            String
  bioPhotoPath        String
}

model BioParagraph {
  id        String @id @default(cuid())
  order     Int
  textEs    String
  textEn    String
}

model PendingUpload {
  id          String   @id @default(cuid())
  path        String   // storage path under pending/, e.g. pending/{id}.{ext}
  mimeType    String
  createdAt   DateTime @default(now())
  claimedAt   DateTime?
}

model LoginAttempt {
  id          String   @id @default(cuid())
  ipAddress   String
  attemptedAt DateTime @default(now())

  @@index([ipAddress, attemptedAt])
}

enum ArtworkType { PAINTING DRAWING }
enum ArtworkStatus { AVAILABLE SOLD }
```

Key decisions carried over from review:

- `Collection.id` (a stable cuid), not `slug`, is the relationship key —
  `CollectionArtwork` references `collectionId`/`artworkId`. `slug` stays `@unique`
  for URLs but can be edited without breaking relationships.
- `displayOrder` on both `Artwork` and `Collection` preserves the current
  gallery/hero/collections-grid ordering through migration and lets it be managed
  later via move-up/move-down controls.
- `isPublished` lets an artwork be hidden without deleting it.
- `imagePath`/`bioPhotoPath` store Storage object paths, not full public URLs — a
  `lib/data.ts` mapper derives the public URL, which also makes replacement,
  deletion, and environment migration (dev/staging/prod Storage buckets) simpler.
- `coverArtworkId` replaces duplicating a cover image URL on `Collection` — a
  collection's cover is just a reference to one of its own artworks, since custom
  cover uploads aren't an actual requirement. `onDelete: SetNull` is written
  explicitly on the relation (rather than relying on it being Prisma's implicit
  default for optional relations) and is covered by a test: deleting an artwork
  that's currently a collection's cover must leave the collection intact with
  `coverArtworkId = null`, not fail or cascade.
- The collection mutation enforces two business rules the schema can't: a
  `coverArtworkId` must belong to that same collection's `CollectionArtwork` set
  (validated before saving, not just trusted from the form), and only **published**
  artworks may be set as a cover — an unpublished cover would render a broken image
  on the public collection page.
- `SiteConfig` is an application-level singleton: all reads and writes use
  `id = 1` (via `upsert({ where: { id: 1 }, ... })`), enforced by convention in
  `lib/data.ts`/the site Server Action, not by a database constraint — Postgres has
  no built-in "exactly one row" constraint, and a second row is harmless as long as
  nothing ever queries or writes with a different `id`.
- `Collection.displayOrder`, `CollectionArtwork.position`, `Artwork.displayOrder`,
  and `BioParagraph.order` are all managed exclusively through move-up/move-down
  admin controls that swap two rows' values inside a single `prisma.$transaction`
  (never a free-text "enter a number" field), which prevents duplicate values from
  being created in normal use. As a defense-in-depth measure against duplicates from
  any future direct DB edit or bug, every ordered query adds a deterministic
  secondary sort key (`id`) as a tiebreaker, so ordering is never left to accidental
  row order even if two rows do share a value.
- `PendingUpload` tracks in-flight image uploads so the artwork/site mutations can
  verify a claimed image actually came from an upload *this app* authorized (see
  "Image upload flow").

### Two database connections

Prisma 7 splits schema from connection configuration: `schema.prisma` declares only
the provider and models (no `datasource url`/`env()`). Connection strings live in:

- **`prisma.config.ts`** — used by `prisma migrate`, `prisma db push`, and Prisma
  Studio. Points at `DIRECT_URL`: Supabase's Supavisor **session pooler**
  (port 5432), which holds a stable connection suited to schema changes.
- **`src/lib/prisma.ts`** — the runtime `PrismaClient`, constructed with the
  `@prisma/adapter-pg` `PrismaPg` driver adapter, passed `DATABASE_URL`: Supabase's
  Supavisor **transaction pooler** (port 6543), suited to serverless functions
  opening short-lived connections per request.

Both are documented in `.env.example` with comments naming the actual pooler mode
(session vs. transaction), not called a "direct" connection — Supabase's session
pooler and a true direct Postgres connection are different options, and this project
uses the session pooler for migrations, not a direct connection.

## Caching & revalidation

`next.config.ts` gets `cacheComponents: true` to enable the `"use cache"` directive
(available in the installed `next@16.2.7`). Note that `"use cache"` behavior —
specifically how long entries persist between requests — depends on the hosting
environment; on Vercel's serverless runtime, cache entries are not guaranteed to
survive between cold starts. The invalidation strategy below (tags + revalidated
paths) is what actually guarantees freshness after an edit; the in-memory cache is
a performance optimization on top of that, not the correctness mechanism.

- `src/lib/data.ts` exposes `getArtworks()`, `getCollections()`,
  `getCollectionBySlug(slug)`, `getSiteConfig()` — each marked `"use cache"` and
  tagged with `cacheTag('artworks')`, `cacheTag('collections')`,
  `cacheTag('site-config')` respectively. `getCollectionBySlug()` tags with both
  `'collections'` and a per-slug tag (`` `collection:${slug}` ``) since it's read on
  the collection-detail page.
- Every mutating Server Action calls `updateTag()` for the tag(s) covering the data
  it changed (e.g. editing an artwork updates `'artworks'` and, if it belongs to any
  collections, `'collections'`), **plus** targeted `revalidatePath()` for the
  specific routes that render that data — `revalidatePath` alone doesn't invalidate
  other cached reads of the same tagged data used elsewhere, so both are needed
  together. Because every mutation knows the concrete slug(s) involved, paths are
  always revalidated as literal paths (e.g. `revalidatePath('/colecciones/estudios')`)
  rather than the pattern form (`revalidatePath('/colecciones/[slug]', 'page')`),
  which exists for cases where the concrete path isn't known — not the case here.
- **Collection slug changes**: updating a collection's `slug` invalidates both the
  old and new identity — `updateTag('collection:' + oldSlug)`,
  `updateTag('collection:' + newSlug)`, `updateTag('collections')`,
  `revalidatePath('/colecciones/' + oldSlug)` (so the old URL stops serving stale
  content before it 404s), and `revalidatePath('/colecciones/' + newSlug)`.
- **Collection deletion**: `updateTag('collection:' + slug)`, `updateTag('collections')`,
  `revalidatePath('/colecciones/' + slug)`, and `revalidatePath('/colecciones')` (the
  grid page, since the deleted collection must disappear from it).

## Image upload flow

Server Actions have a default 1MB body limit, too small for artwork photos, so
uploads don't go through the create/update action directly. New artworks also don't
have an `id` yet at upload time, so uploads are staged through a `PendingUpload`
record rather than a path keyed on the artwork's (not-yet-existing) id:

1. Client requests an upload slot via Server Action `createPendingUpload(fileName,
   mimeType, fileSize)`. This calls `requireAdmin()`, validates `mimeType` (jpeg,
   png, webp only) and `fileSize` (e.g. max 10MB) with Zod, creates a
   `PendingUpload` row at a stable path `pending/{uploadId}.{ext}`, and returns a
   Supabase Storage **signed upload URL** for that exact path plus the
   `uploadId`.
2. Browser uploads the file directly to Supabase Storage using the signed URL —
   the file never passes through a Next.js server function.
3. On upload success, the client submits `uploadId` (not a raw path) as part of the
   artwork/site create-or-update Server Action payload.
4. That action, after validating the rest of the form and calling `requireAdmin()`:
   - Looks up the `PendingUpload` by `uploadId`, rejecting if it doesn't exist, is
     already `claimedAt`, or has expired (see cleanup below).
   - Confirms the corresponding Storage object actually exists at `pending/{uploadId}.{ext}`
     and matches the recorded `mimeType`/size limits — the claimed upload is
     verified server-side, not trusted from the client.
   - Moves the Storage object from `pending/{uploadId}.{ext}` to its permanent path
     (`artworks/{artworkId}/{uploadId}.{ext}` for artworks, `site/bio-photo.{ext}`
     for the bio photo), sets `imagePath`/`bioPhotoPath` to the new path, and marks
     `PendingUpload.claimedAt`.
5. When an artwork's image is replaced or the artwork is deleted, the action deletes
   the old (now-orphaned) Storage object after the DB write succeeds.
6. **Abandoned uploads** (a `PendingUpload` a user never submitted a form for — e.g.
   they uploaded a file then closed the tab) are cleaned up by a daily Vercel Cron
   route (`/api/cron/cleanup-uploads`, configured in `vercel.json`) that deletes any
   `PendingUpload` row with `claimedAt = null` and `createdAt` older than 24 hours,
   along with its Storage object.

## Admin UI (`/admin`, all routes protected per "Auth & security" above)

- `/admin/login` — password form, shows rate-limit/error messages.
- `/admin` — dashboard: total artworks, available vs. sold counts, quick links.
- `/admin/artworks` — table (search, filter by type/status), move-up/move-down
  reordering, publish/unpublish toggle, links to create/edit.
- `/admin/artworks/new`, `/admin/artworks/[id]` — form: type, image upload,
  title (es/en), technique (es/en), size, year, price, status, published toggle.
- `/admin/collections` — list with move-up/move-down reordering; create/edit form
  with name (es/en), a cover picker restricted to that collection's own published
  artworks, and an artwork assignment list with position/move controls.
- `/admin/site` — form for `SiteConfig` fields plus bio paragraphs (add/remove/
  reorder) and bio photo upload.
- Logout button in the admin layout header.

## Public component changes

`HeroSlideshow` is **not** the only place static data is imported directly into a
Client Component — it's one of several. Every one of these currently has
`'use client'` at the top and imports directly from `src/data/*`:

| Component | Currently imports | Becomes |
|---|---|---|
| `HeroSlideshow` | `artworks` | `artworks: Artwork[]` prop |
| `WorksGallery` | `artworks` | `artworks: Artwork[]` prop |
| `BioSection` | `bio` | `bio`, `bioPhotoUrl` props |
| `ContactSection` | `siteConfig` | `siteConfig: SiteConfig` prop |
| `Navbar` | `siteConfig`, `navItems` | `siteConfig` prop; `navItems` stays a static import (non-goal: not editable) |
| `Footer` | `siteConfig`, `navItems`, `bio` | `siteConfig`, `bio` props; `navItems` stays static |
| `CollectionsGrid` | `collections` | `collections: Collection[]` prop |
| `CollectionDetail` | `collections`, `artworks` (looks up by `slug` prop) | `collection: Collection`, `works: Artwork[]` props — the lookup-by-slug moves to the Server Component page, which calls `getCollectionBySlug(slug)` and passes `notFound()` if it's null |

`WhatsAppButton` is the one component that **isn't** a Client Component today (no
`'use client'`, no hooks) — it stays a Server Component and simply calls
`getSiteConfig()` itself rather than needing a prop at all.

The general pattern: the three route-level Server Components
(`src/app/page.tsx`, `src/app/colecciones/page.tsx`,
`src/app/colecciones/[slug]/page.tsx`) call the relevant `lib/data.ts` functions
(cheap — they're `"use cache"`-backed) and pass the results down as serializable
props to the Client Components that render them. Each of these three pages already
renders `Navbar`/`Footer`/`WhatsAppButton` directly (there's no shared layout
wrapper for them today), so each page fetches `getSiteConfig()` once and passes it
to both `Navbar` and `Footer` — no Client Context is introduced, matching this
project's existing preference (from the original rebuild spec) against adding state
management machinery it doesn't need. With only three route-level pages, prop
passing is simpler than standing up a context provider.

## Data migration

A local, rerunnable script (`scripts/migrate-to-supabase.ts`):

1. **Dry-run mode** (default): reads `src/data/artworks.ts`, `collections.ts`,
   `site.ts`, and `public/*.jpg`, prints what it would create/upsert/upload, and
   exits without writing anything.
2. **Run mode** (`--apply`):
   - Uploads each image in `public/` to Storage at a stable, deterministic path
     (derived from the artwork/bio-photo identity, not a random name), so reruns
     overwrite/skip rather than duplicate.
   - Upserts `Artwork`, `Collection`, `CollectionArtwork`, `SiteConfig`, and
     `BioParagraph` rows by their stable IDs/slugs — safe to run more than once.
   - Assigns `Artwork.displayOrder` from each artwork's current array index and
     `Collection.displayOrder` from the current `collections` array index,
     preserving today's gallery/hero/collections-grid order.
   - After writing, re-reads the data back and asserts counts match the source
     files (49 artworks, 4 collections, expected `CollectionArtwork` row count) and
     that every `coverArtworkId`/`CollectionArtwork.artworkId` resolves to a real
     artwork — fails loudly if not.
3. Storage uploads and DB writes aren't one transaction (can't be, across two
   systems), so the script is designed to be safely rerunnable rather than relying
   on atomicity.
4. `public/*.jpg` and `src/data/*.ts` are **not** deleted by this project — they stay
   in the repo until the deployed database-backed version has been verified in
   production, at which point removing them is a deliberate follow-up decision.

## Testing plan

- **Unit**: `requireAdmin()` rejects missing/invalid/expired sessions; login rate
  limiter blocks after 5 attempts/15min and allows after the window passes (and
  after old attempts are pruned); Zod schemas for artwork/collection/site-config/
  upload-request inputs; the `imagePath` → public URL mapper; the migration-URL
  split (runtime code only ever reads `DATABASE_URL`, `prisma.config.ts` only ever
  reads `DIRECT_URL` — a test asserting `src/lib/prisma.ts` doesn't reference
  `DIRECT_URL` at all).
- **Integration** (against a disposable test Postgres): artwork/collection CRUD
  through the Server Actions; `displayOrder`/`position`/`order` are respected by
  `getArtworks()`/`getCollections()`/`getCollectionBySlug()`, including a case with
  duplicate values to confirm the secondary `id` tiebreaker keeps results
  deterministic; calling a mutating action without a valid session cookie is
  rejected even if `proxy.ts` is bypassed; an expired (but well-formed) session
  cookie is rejected by `requireAdmin()` and causes `/admin/layout.tsx` to redirect
  to login; `updateTag`/`revalidatePath` are invoked with the expected tags/paths on
  each mutation type, including a collection slug change (old + new tags/paths) and
  a collection deletion; every Client Component listed in "Public component
  changes" renders correctly from server-provided props (no direct data import);
  the full pending-upload flow (`createPendingUpload` → claim during artwork save →
  object moved to its permanent path); submitting an artwork with an unclaimed/
  nonexistent/expired `uploadId` is rejected; deleting an artwork that is a
  collection's cover leaves the collection with `coverArtworkId = null`; attempting
  to set a cover to an artwork outside the collection, or an unpublished artwork, is
  rejected; image replacement and artwork deletion both remove the old Storage
  object (orphan cleanup).
- **Cron cleanup**: the abandoned-upload cleanup route deletes `PendingUpload` rows
  (and their Storage objects) older than 24 hours with `claimedAt = null`, and
  leaves claimed or recent unclaimed uploads untouched.
- **Migration script**: dry-run produces no writes; run mode is idempotent
  (running twice yields the same row counts, no duplicates); `displayOrder` on both
  `Artwork` and `Collection` matches source array order; count and relationship
  assertions catch a deliberately broken fixture (e.g. an unresolvable
  `coverArtworkId`).
- **E2E (Playwright)**: login → create an artwork with an image upload → verify it
  appears on `/` and in the relevant collection page within the revalidation window
  → edit its status to `sold` → verify the public page reflects it → delete it →
  logout → confirm `/admin` redirects to login. Also: exceeding the login rate limit
  shows the lockout message; renaming a collection's slug updates its public URL
  and the old URL no longer serves the collection.
- Existing component tests (`ArtworkCard`, etc. — the ones that don't import data
  directly) keep passing unchanged; tests for the components listed in "Public
  component changes" are updated to pass props instead of relying on the static
  data modules.

## Open implementation decisions (left to planning)

- Exact test-database strategy for integration tests (local Postgres via Docker vs.
  a dedicated disposable Supabase project).
- Whether artwork `displayOrder` is scoped globally or per `type` — the current
  static array is a single flat list mixing paintings and drawings, so the default
  is a single global ordering unless the gallery's filter/sort behavior needs
  otherwise.
