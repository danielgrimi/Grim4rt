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
- Public pages stay statically fast — no per-visitor database reads — but reflect
  admin edits within seconds via targeted cache invalidation.
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
- **Prisma 7** (`prisma.config.ts` convention) as the ORM — migrations, typed client,
  Prisma Studio as a database GUI.
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
- **`proxy.ts`** (replaces the deprecated `middleware.ts` convention in Next.js 16):
  matches `/admin/:path*` except `/admin/login`, does a lightweight check for a
  present, well-formed session cookie, and redirects to `/admin/login` if missing.
  This is a UX convenience only — **not** the security boundary, since proxy/edge
  checks can be bypassed by hitting Server Actions directly.
- **`requireAdmin()`** (`src/lib/auth.ts`): reads and verifies the session cookie via
  `jose`, throwing if missing/invalid/expired. Every admin Server Action and every
  admin data-loading function calls this independently as its first line — Server
  Actions are externally reachable POST endpoints regardless of what proxy does.
- **Login rate limiting**: a `LoginAttempt { id, ipAddress, attemptedAt }` table
  (DB-backed so it works across serverless instances). Before verifying a password,
  count attempts from that IP in the last 15 minutes; reject with a "too many
  attempts" error above 5.

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
  coverArtworkId  String?
  coverArtwork    Artwork? @relation("CollectionCover", fields: [coverArtworkId], references: [id])
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

model LoginAttempt {
  id          String   @id @default(cuid())
  ipAddress   String
  attemptedAt DateTime @default(now())
}

enum ArtworkType { PAINTING DRAWING }
enum ArtworkStatus { AVAILABLE SOLD }
```

Key decisions carried over from review:

- `Collection.id` (a stable cuid), not `slug`, is the relationship key —
  `CollectionArtwork` references `collectionId`/`artworkId`. `slug` stays `@unique`
  for URLs but can be edited without breaking relationships.
- `displayOrder` on `Artwork` preserves the current gallery/hero ordering through
  migration and lets it be managed later.
- `isPublished` lets an artwork be hidden without deleting it.
- `imagePath`/`bioPhotoPath` store Storage object paths, not full public URLs — a
  `lib/data.ts` mapper derives the public URL, which also makes replacement,
  deletion, and environment migration (dev/staging/prod Storage buckets) simpler.
- `coverArtworkId` replaces duplicating a cover image URL on `Collection` — a
  collection's cover is just a reference to one of its own artworks, since custom
  cover uploads aren't an actual requirement.

### Two database connections

Per Supabase's current Prisma guidance, `prisma.config.ts` and `schema.prisma`
reference two separate connection strings:

- `DATABASE_URL` — Supavisor **transaction pooling** connection, used by
  `PrismaClient` at runtime (serverless-friendly, short-lived connections).
- `DIRECT_URL` — Supavisor **session** (direct) connection, used only by
  `prisma migrate` / `prisma db push` / Prisma Studio, which need a stable
  connection for schema changes.

Both documented in `.env.example` with comments explaining which is which.

## Caching & revalidation

`next.config.ts` gets `cacheComponents: true` to enable the `"use cache"` directive
(available in the installed `next@16.2.7`).

- `src/lib/data.ts` exposes `getArtworks()`, `getCollections()`,
  `getCollectionBySlug()`, `getSiteConfig()` — each marked `"use cache"` and tagged
  with `cacheTag('artworks')`, `cacheTag('collections')`, `cacheTag('site-config')`
  respectively. `getCollectionBySlug()` tags with both `'collections'` and a
  per-slug tag (`collection:${slug}`) since it's read on the collection-detail page.
- Every mutating Server Action calls `updateTag()` for the tag(s) covering the data
  it changed (e.g. editing an artwork updates `'artworks'` and, if it belongs to any
  collections, `'collections'`), **plus** targeted `revalidatePath()` for the
  specific routes that render that data (`/`, `/colecciones`,
  `/colecciones/[slug]`) — `revalidatePath` alone doesn't invalidate other cached
  reads of the same tagged data used elsewhere, so both are needed together.

## Image upload flow

Server Actions have a default 1MB body limit, too small for artwork photos, so
uploads don't go through the create/update action directly:

1. Client requests an upload slot via Server Action `createUploadUrl(fileName,
   mimeType, fileSize)`. This calls `requireAdmin()`, validates `mimeType` (jpeg,
   png, webp only) and `fileSize` (e.g. max 10MB) with Zod, then generates a
   Supabase Storage **signed upload URL** for a stable path
   (`artworks/{artworkId}/{cuid}.{ext}`).
2. Browser uploads the file directly to Supabase Storage using the signed URL —
   the file never passes through a Next.js server function.
3. On upload success, the client submits the resulting storage path as part of the
   artwork create/update Server Action payload (validated via Zod alongside the
   rest of the form).
4. When an artwork's image is replaced or the artwork is deleted, the action deletes
   the old Storage object after the DB write succeeds (orphan cleanup).

## Admin UI (`/admin`, all routes call `requireAdmin()`)

- `/admin/login` — password form, shows rate-limit/error messages.
- `/admin` — dashboard: total artworks, available vs. sold counts, quick links.
- `/admin/artworks` — table (search, filter by type/status), move-up/move-down
  reordering, publish/unpublish toggle, links to create/edit.
- `/admin/artworks/new`, `/admin/artworks/[id]` — form: type, image upload,
  title (es/en), technique (es/en), size, year, price, status, published toggle.
- `/admin/collections` — list; create/edit form with name (es/en), cover artwork
  picker, and an artwork assignment list with position/move controls.
- `/admin/site` — form for `SiteConfig` fields plus bio paragraphs (add/remove/
  reorder) and bio photo upload.
- Logout button in the admin layout header.

## Public component changes

Public components keep their existing prop shapes — `lib/data.ts` maps DB rows back
to the same `Artwork`/`Collection`/`SiteConfig` types already defined in
`src/types/index.ts` (`imagePath` → resolved public URL as `img`, etc.), so
`ArtworkCard`, `WorksGallery`, `CollectionsGrid`, `CollectionDetail`, `BioSection`,
and `ContactSection` need no changes beyond swapping their data source from a static
import to a call into `lib/data.ts`.

The one exception: **`HeroSlideshow`** currently imports the static `artworks` array
directly inside a Client Component (`'use client'`). Since Prisma/`"use cache"` reads
can't happen inside a Client Component, `HeroSlideshow`'s data loading moves to its
parent Server Component (`src/app/page.tsx`), which calls `getArtworks()` and passes
the resulting array down as a prop — `HeroSlideshow` itself stays a Client Component
for its slideshow interaction/animation logic, just fed via props instead of an
import.

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
   - Assigns `displayOrder` from each artwork's current array index, preserving
     today's gallery/hero order.
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
  limiter blocks after 5 attempts/15min and allows after the window passes; Zod
  schemas for artwork/collection/site-config/upload-request inputs; the
  `imagePath` → public URL mapper.
- **Integration** (against a disposable test Postgres): artwork/collection CRUD
  through the Server Actions; `displayOrder` and `CollectionArtwork.position` are
  respected by `getArtworks()`/`getCollectionBySlug()`; calling a mutating action
  without a valid session cookie is rejected even if `proxy.ts` is bypassed;
  `updateTag`/`revalidatePath` are invoked with the expected tags/paths on each
  mutation (spied, not asserting actual cache behavior); image replacement deletes
  the old Storage object (orphan cleanup) and deletion removes both the DB row and
  the Storage object.
- **Migration script**: dry-run produces no writes; run mode is idempotent
  (running twice yields the same row counts, no duplicates); count and relationship
  assertions catch a deliberately broken fixture (e.g. an unresolvable
  `coverArtworkId`).
- **E2E (Playwright)**: login → create an artwork with an image upload → verify it
  appears on `/` and in the relevant collection page within the revalidation window
  → edit its status to `sold` → verify the public page reflects it → delete it →
  logout → confirm `/admin` redirects to login. Also: exceeding the login rate limit
  shows the lockout message.
- Existing component tests (`ArtworkCard`, `WorksGallery`, etc.) keep passing
  unchanged since prop shapes don't change.

## Open implementation decisions (left to planning)

- Exact test-database strategy for integration tests (local Postgres via Docker vs.
  a dedicated disposable Supabase project).
- Whether artwork `displayOrder` is scoped globally or per `type` — the current
  static array is a single flat list mixing paintings and drawings, so the default
  is a single global ordering unless the gallery's filter/sort behavior needs
  otherwise.
