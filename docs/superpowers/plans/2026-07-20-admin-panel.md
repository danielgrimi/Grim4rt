# Grim4rt Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Grim4rt's hardcoded typed data files (`src/data/artworks.ts`, `collections.ts`, `site.ts`) with a Postgres-backed content model (Supabase) and a single-admin panel (`/admin`) so Daniel can create/edit/delete artworks, manage collections, and edit site/bio info without a redeploy — while public pages stay statically fast via cached reads with targeted invalidation. This plan executes the approved design at `docs/superpowers/specs/2026-07-14-admin-panel-design.md` verbatim; it does not re-open any decision made there.

**Architecture:** Next.js 16 App Router, `cacheComponents: true` + `"use cache"`/`cacheTag`/`updateTag` for public reads (`src/lib/data.ts`), Prisma 7 with the `@prisma/adapter-pg` driver adapter against Supabase Postgres (two pooler connections — see Task 2), Supabase Storage (`artwork-images` bucket) for images with a pending-upload staging flow, `jose`-signed HTTP-only session cookies for a single shared admin password (Argon2-hashed), and an `/admin` route tree gated by `proxy.ts` (fast cookie-presence check) + `requireAdmin()` (authoritative verification, called from `/admin`'s layout and every Server Action independently).

**Tech Stack additions on top of the existing Next.js 16.2.7 / React 19.2.4 / TypeScript / Tailwind / Vitest stack:** Prisma 7 + `@prisma/adapter-pg`, `@supabase/supabase-js`, `zod`, `jose`, `@node-rs/argon2`, `tsx` (for running local scripts).

## Global Constraints

- This plan implements the design at `docs/superpowers/specs/2026-07-14-admin-panel-design.md` — read that file for the full rationale behind every schema field, cache tag, and business rule referenced below. Where this plan states a decision not spelled out verbatim in the design doc (there are a small number, always called out explicitly as "**Decision:**"), it is filling an implementation gap, not overriding anything the design doc settled.
- **Branch-agnostic.** Git is not assumed to be usable in the execution environment (it may be blocked on an unrelated Xcode license issue). Do not assume a branch exists, do not run `git commit`/`git add` as part of any task's steps. Each task's verification step instead ends with a plain bullet: "Commit this task's changes" — the executing agent/human runs whatever git workflow is available to them once git works. Suggested branch name, if/when git is usable: `feature/admin-panel`.
- No deployment/hosting setup beyond what's needed for the app to run (`vercel.json` cron config in Task 12 is configuration, not a deploy step) — verification is local (`npm run dev`, `npm run build`, `npm run test:run`, `npm run lint`) plus the manual/dashboard steps explicitly marked "Manual step (not automatable)".
- New package versions are pinned as `"latest"` in every `package.json` snippet below, each with an inline comment `// pin exact resolved version after npm install` — do not web-search for real version numbers; run `npm install` and let npm resolve them, then optionally replace `"latest"` with the resolved version from `package-lock.json`.
- `src/data/*.ts` and the root-level `public/*.jpg` files are **not** deleted by this plan (per the design doc's migration section) — they remain until the deployed DB-backed version is verified in production, at which point removing them is a deliberate follow-up.
- Brand colors/fonts/Tailwind tokens from the original rebuild are unchanged and reused as-is in every new admin UI file (`brand.black`, `brand.dark`, `brand.card`, `brand.border`, `brand.accent`, `brand.accentLight`, `brand.text`, `brand.muted`; `font-display`/`font-sans`).
- Every mutating Server Action calls `requireAdmin()` as its first line, independent of `proxy.ts` or the admin layout — this is non-negotiable per the design doc's security model and is repeated in literally every action below; do not skip it "because the layout already checked."
- Admin pages read directly from `prisma` (not through `src/lib/data.ts`'s `"use cache"` functions) — admin needs to see unpublished/just-written state immediately, and isn't subject to the public caching strategy. Only the three public route pages (`src/app/page.tsx`, `src/app/colecciones/page.tsx`, `src/app/colecciones/[slug]/page.tsx`) and `WhatsAppButton` call `src/lib/data.ts`.

---

### Task 1: Install admin-stack dependencies & environment configuration

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `next.config.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` env vars (consumed by every later task), `experimental.cacheComponents: true` in `next.config.ts` (required for `"use cache"` in Task 5).

- [ ] **Step 1: Add admin-stack dependencies to `package.json`**

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
    "test:run": "vitest run",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "hash-password": "tsx scripts/generate-password-hash.ts",
    "migrate-data": "tsx scripts/migrate-to-supabase.ts"
  },
  "dependencies": {
    "@node-rs/argon2": "latest",
    "@prisma/adapter-pg": "latest",
    "@prisma/client": "latest",
    "@supabase/supabase-js": "latest",
    "framer-motion": "^12.40.0",
    "jose": "latest",
    "lucide-react": "^1.24.0",
    "next": "16.2.7",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zod": "latest"
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
    "dotenv": "latest",
    "eslint": "^9",
    "eslint-config-next": "16.2.7",
    "jsdom": "^29.1.1",
    "postcss": "^8.5.15",
    "prisma": "latest",
    "tailwindcss": "^3.4.19",
    "tsx": "latest",
    "typescript": "^5",
    "vitest": "^4.1.8"
  }
}
```

Every `"latest"` above: pin the exact version npm resolves into `package-lock.json` after Step 5's install, per the Global Constraints note — do not guess a version number ahead of time.

- [ ] **Step 2: Allow `.env.example` past the blanket `.env*` ignore rule**

The existing `.gitignore` has `.env*`, which also matches `.env.example` — an example file with placeholder values (no real secrets) is meant to be committed so the next person has a template. Add an explicit negation immediately after the `.env*` line:

```gitignore
# env files (can opt-in for committing if needed)
.env*
!.env.example
```

- [ ] **Step 3: Enable `cacheComponents` in `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Enables the "use cache" directive + cacheTag()/updateTag() used by
    // src/lib/data.ts (Task 5) and every mutating Server Action's
    // invalidation calls (Tasks 8-9). See design doc "Caching & revalidation".
    cacheComponents: true,
  },
}

export default nextConfig
```

- [ ] **Step 4: Create `.env.example`**

```bash
# --- Supabase Postgres: two distinct pooler connections ---
# See docs/superpowers/specs/2026-07-14-admin-panel-design.md → "Two database
# connections" for the full rationale. These are Supavisor POOLER modes, not a
# true direct Postgres connection.

# Supavisor TRANSACTION pooler (port 6543) — used ONLY by the runtime Prisma
# Client (src/lib/prisma.ts). Suited to serverless functions opening many
# short-lived connections per request.
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supavisor SESSION pooler (port 5432) — used ONLY by prisma.config.ts
# (prisma migrate / prisma db push / Prisma Studio). Holds a stable
# connection suited to schema changes.
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# --- Supabase Storage (artwork-images bucket) ---
SUPABASE_URL="https://[project-ref].supabase.co"
# Server-only secret — never exposed to the client, never prefixed NEXT_PUBLIC_.
SUPABASE_SERVICE_ROLE_KEY="[service-role key from Supabase dashboard > Project Settings > API]"

# --- Auth ---
# Argon2 hash of the single admin password. Generate with:
#   npm run hash-password -- "<your password>"
ADMIN_PASSWORD_HASH=""
# Random secret used only to sign/verify the session JWT (never the password
# itself). Generate with: openssl rand -base64 32
SESSION_SECRET=""
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: installs without errors, `package-lock.json` updated with resolved versions for every `"latest"` entry above.

- [ ] **Step 6: Verify the app still builds with the new config**

Run: `npm run build`
Expected: succeeds (no admin/Prisma code exists yet, so this only proves `cacheComponents: true` doesn't break the existing three public routes).

- [ ] Commit this task's changes.

---

### Task 2: Prisma schema, config, and runtime client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma.config.ts`
- Create: `src/lib/prisma.ts`
- Test: `src/test/prisma-env-split.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` (runtime), `DIRECT_URL` (CLI/migrations) from Task 1's `.env.example`.
- Produces: `prisma` (typed `PrismaClient` singleton, exported from `src/lib/prisma.ts`) — consumed by every Server Action and `src/lib/data.ts` from Task 5 onward. Prisma-generated model types (`Artwork`, `Collection`, `CollectionArtwork`, `SiteConfig`, `BioParagraph`, `PendingUpload`, `LoginAttempt`, `ArtworkType`, `ArtworkStatus`) from `@prisma/client`.

- [ ] **Step 1: Create `prisma/schema.prisma`**

The models below are copied verbatim from the design doc's "Database schema (Prisma)" section — do not alter field names, types, or relations. `datasource db` intentionally declares only `provider` (no `url`/`env()`) — connection strings live in `prisma.config.ts` (CLI) and `src/lib/prisma.ts` (runtime) instead, per the design doc's "Two database connections."

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

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

- [ ] **Step 2: Create `prisma.config.ts`**

```typescript
// prisma.config.ts
//
// Prisma 7 config file — replaces the `datasource db { url = env(...) }`
// pattern. NOTE: the config-file API is new enough that its exact shape
// should be double-checked against the installed version's own type
// definitions (`node_modules/prisma/config.d.ts`, or `npx prisma --help`)
// right after Task 1's `npm install` — adjust this file if the installed
// Prisma 7's `defineConfig` signature differs from what's written here.
import 'dotenv/config'
import { defineConfig } from 'prisma/config'
import path from 'node:path'

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    // Supavisor SESSION pooler (port 5432) — used only by `prisma migrate`,
    // `prisma db push`, and Prisma Studio. Runtime code never reads this;
    // see src/lib/prisma.ts, which reads DATABASE_URL exclusively.
    url: process.env.DIRECT_URL,
  },
})
```

- [ ] **Step 3: Create `src/lib/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  // Supavisor TRANSACTION pooler (port 6543) — see prisma.config.ts for the
  // migration-time SESSION pooler counterpart. This file must never read
  // DIRECT_URL (asserted by src/test/prisma-env-split.test.ts).
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

// Reuse a single client across hot reloads in dev (avoids exhausting the
// pooler's connection slots); always fresh in production serverless.
export const prisma = globalThis.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}
```

- [ ] **Step 4: Write `src/test/prisma-env-split.test.ts`**

Per the design doc's testing plan: "a test asserting `src/lib/prisma.ts` doesn't reference `DIRECT_URL` at all."

```typescript
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('runtime vs. migration connection-string split', () => {
  it('src/lib/prisma.ts never references DIRECT_URL', () => {
    const source = readFileSync('src/lib/prisma.ts', 'utf-8')
    expect(source).not.toContain('DIRECT_URL')
  })

  it('prisma.config.ts never references DATABASE_URL', () => {
    const source = readFileSync('prisma.config.ts', 'utf-8')
    expect(source).not.toContain('DATABASE_URL')
  })
})
```

- [ ] **Step 5: Run the test**

Run: `npm run test:run -- src/test/prisma-env-split.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Generate the Prisma client**

Run: `npx prisma generate`
Expected: generates `@prisma/client` types matching the schema above (no database connection needed for `generate`).

- [ ] Commit this task's changes.

---

### Task 3: Supabase Storage wiring & storage helper library

**Files:**
- Create: `src/lib/storage.ts`
- Test: `src/test/storage.test.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from Task 1.
- Produces: `publicUrlFor(path)`, `createSignedUploadUrl(path)`, `objectExists(path)`, `moveObject(from, to)`, `deleteObject(path)` — consumed by `src/lib/data.ts` (Task 5), the upload flow (Task 7), and every artwork/collection/site Server Action (Tasks 8-9).

- [ ] **Step 1: Manual step (not automatable) — create the Supabase project and Storage bucket**

These require the Supabase dashboard (no CLI/API call replaces account-level project creation in this plan):
1. Create a Supabase project (or reuse an existing one). Note the project ref, database password, and (from Project Settings → API) the `service_role` key and project URL — these fill in `.env.example`'s placeholders.
2. Storage → New bucket → name it exactly `artwork-images`, toggle **Public bucket** ON. A public bucket serves object reads over Supabase's CDN with no additional read policy needed — this satisfies the design doc's "public-read Storage bucket" requirement without writing RLS policies by hand.
3. No Storage **write** policy is needed either: every write in this app (signed upload URL issuance, move, delete) goes through the `service_role` key server-side, which bypasses Row Level Security entirely. There is no client-side Supabase Auth session anywhere in this app — uploads happen via signed URLs the server pre-authorizes (Task 7), not via a client-held Supabase credential.
4. From Project Settings → Database → Connection string, copy the **Session pooler** (port 5432) URI into `DIRECT_URL` and the **Transaction pooler** (port 6543) URI into `DATABASE_URL` in your local `.env`.

- [ ] **Step 2: Create `src/lib/storage.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'artwork-images'

function getClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set')
  }
  // service_role bypasses RLS — safe here because this module only ever
  // runs server-side (Server Actions, Server Components, scripts).
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Derives the public CDN URL for a Storage object path (e.g. "artworks/abc/xyz.jpg"). */
export function publicUrlFor(path: string): string {
  const { data } = getClient().storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Issues a one-time signed URL the browser can PUT a file to directly. */
export async function createSignedUploadUrl(
  path: string
): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) throw new Error(`Failed to create signed upload URL: ${error.message}`)
  return { signedUrl: data.signedUrl, token: data.token }
}

/** Confirms an object was actually uploaded to `path` before it's trusted/claimed. */
export async function objectExists(path: string): Promise<boolean> {
  const lastSlash = path.lastIndexOf('/')
  const dir = lastSlash === -1 ? '' : path.slice(0, lastSlash)
  const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1)
  const { data, error } = await getClient().storage.from(BUCKET).list(dir, { search: filename })
  if (error) return false
  return data.some((entry) => entry.name === filename)
}

/** Moves a pending upload to its permanent path (claim step). */
export async function moveObject(from: string, to: string): Promise<void> {
  const { error } = await getClient().storage.from(BUCKET).move(from, to)
  if (error) throw new Error(`Failed to move storage object from ${from} to ${to}: ${error.message}`)
}

/** Deletes an orphaned object (image replaced or artwork deleted). Never throws — a
 *  failed best-effort cleanup shouldn't roll back a DB write that already succeeded. */
export async function deleteObject(path: string): Promise<void> {
  const { error } = await getClient().storage.from(BUCKET).remove([path])
  if (error) {
    console.error(`Failed to delete storage object ${path}:`, error.message)
  }
}
```

- [ ] **Step 3: Write `src/test/storage.test.ts`**

Mocks `@supabase/supabase-js` so this test suite runs without real Supabase credentials — it verifies this module's own logic (path parsing, error wrapping), not Supabase's API itself.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listMock = vi.fn()
const moveMock = vi.fn()
const removeMock = vi.fn()
const getPublicUrlMock = vi.fn()
const createSignedUploadUrlMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        list: listMock,
        move: moveMock,
        remove: removeMock,
        getPublicUrl: getPublicUrlMock,
        createSignedUploadUrl: createSignedUploadUrlMock,
      }),
    },
  }),
}))

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
  listMock.mockReset()
  moveMock.mockReset()
  removeMock.mockReset()
  getPublicUrlMock.mockReset()
  createSignedUploadUrlMock.mockReset()
})

describe('storage helpers', () => {
  it('publicUrlFor derives a public URL from a path', async () => {
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://cdn.example/artwork-images/foo.jpg' } })
    const { publicUrlFor } = await import('@/lib/storage')
    expect(publicUrlFor('foo.jpg')).toBe('https://cdn.example/artwork-images/foo.jpg')
  })

  it('objectExists returns true when the file is listed in its directory', async () => {
    listMock.mockResolvedValue({ data: [{ name: 'abc.jpg' }], error: null })
    const { objectExists } = await import('@/lib/storage')
    expect(await objectExists('pending/abc.jpg')).toBe(true)
    expect(listMock).toHaveBeenCalledWith('pending', { search: 'abc.jpg' })
  })

  it('objectExists returns false when the file is absent', async () => {
    listMock.mockResolvedValue({ data: [], error: null })
    const { objectExists } = await import('@/lib/storage')
    expect(await objectExists('pending/missing.jpg')).toBe(false)
  })

  it('objectExists returns false on a list error rather than throwing', async () => {
    listMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { objectExists } = await import('@/lib/storage')
    expect(await objectExists('pending/abc.jpg')).toBe(false)
  })

  it('moveObject throws a descriptive error when the move fails', async () => {
    moveMock.mockResolvedValue({ error: { message: 'not found' } })
    const { moveObject } = await import('@/lib/storage')
    await expect(moveObject('pending/a.jpg', 'artworks/1/a.jpg')).rejects.toThrow(
      /Failed to move storage object/
    )
  })

  it('deleteObject swallows errors instead of throwing', async () => {
    removeMock.mockResolvedValue({ error: { message: 'gone already' } })
    const { deleteObject } = await import('@/lib/storage')
    await expect(deleteObject('artworks/1/a.jpg')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npm run test:run -- src/test/storage.test.ts`
Expected: PASS (6 tests).

- [ ] Commit this task's changes.

---

### Task 4: Auth — session verification, login/logout, rate limiting, `proxy.ts`

**Files:**
- Create: `src/lib/auth-constants.ts`
- Create: `src/lib/auth.ts`
- Create: `src/lib/validation.ts`
- Create: `scripts/generate-password-hash.ts`
- Create: `src/lib/actions/auth-actions.ts`
- Create: `src/app/admin/login/page.tsx`
- Create: `src/components/admin/LoginForm.tsx`
- Create: `proxy.ts`
- Test: `src/test/auth.test.ts`
- Test: `src/test/rate-limit.test.ts`

**Interfaces:**
- Consumes: `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` (Task 1), `prisma` (Task 2).
- Produces: `requireAdmin()` (redirects to `/admin/login` if the session is missing/invalid/expired — called from the admin layout in Task 8 and as the first line of every mutating Server Action in Tasks 7-9), `verifySession()`, `createSession()`, `destroySession()`, `checkRateLimit(ip)`/`recordLoginAttempt(ip)`, `login`/`logoutAction` Server Actions, `SESSION_COOKIE_NAME` constant (used by `proxy.ts` without pulling in Prisma).

**Decision:** the design doc describes `requireAdmin()` as used both by the admin layout (which redirects) and by Server Actions (which reject). Rather than two functions with divergent failure modes, `requireAdmin()` is a single function that always calls Next's `redirect('/admin/login')` on an invalid/missing session — `redirect()` works identically (throwing a framework-recognized `NEXT_REDIRECT` signal) whether called from a Server Component or a Server Action, so one implementation satisfies both call sites described in the design doc without behavioral duplication.

**Decision:** `SESSION_COOKIE_NAME` lives in its own tiny module (`src/lib/auth-constants.ts`) rather than `src/lib/auth.ts`, so that `proxy.ts` — which the design doc says "runs in the Node.js runtime by default" but which still benefits from staying minimal — never pulls in `src/lib/prisma.ts` (imported transitively by `src/lib/auth.ts` for rate limiting) just to read a cookie name.

- [ ] **Step 1: Create `src/lib/auth-constants.ts`**

```typescript
export const SESSION_COOKIE_NAME = 'grim4rt_admin_session'
export const SESSION_TTL_SECONDS = 8 * 60 * 60 // 8 hours, per design doc
```

- [ ] **Step 2: Create `src/lib/validation.ts`** (started here with the login schema; Tasks 7-9 extend this same file with upload/artwork/collection/site-config schemas)

```typescript
import { z } from 'zod'

export const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
})
```

- [ ] **Step 3: Create `src/lib/auth.ts`**

```typescript
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignJWT, jwtVerify } from 'jose'
import { prisma } from '@/lib/prisma'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '@/lib/auth-constants'

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 5

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function createSession(): Promise<void> {
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey())

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

/** Verifies the session cookie's signature and expiry. Never throws — returns false. */
export async function verifySession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return false

  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    return payload.role === 'admin'
  } catch {
    return false
  }
}

/**
 * Authoritative admin gate. Redirects to /admin/login on any missing/invalid/
 * expired session. Called from src/app/admin/(protected)/layout.tsx AND as the
 * first line of every mutating Server Action under /admin — Server Actions are
 * externally reachable POST endpoints regardless of what proxy.ts or the
 * layout do, so each one re-checks independently.
 */
export async function requireAdmin(): Promise<void> {
  const valid = await verifySession()
  if (!valid) {
    redirect('/admin/login')
  }
}

/**
 * Prunes this IP's attempts older than the 15-minute window, then reports
 * whether a new attempt is currently allowed (fewer than 5 in the window).
 * Pruning first keeps the table bounded without a separate cleanup job.
 */
export async function checkRateLimit(ipAddress: string): Promise<{ allowed: boolean }> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)

  await prisma.loginAttempt.deleteMany({
    where: { ipAddress, attemptedAt: { lt: windowStart } },
  })

  const count = await prisma.loginAttempt.count({
    where: { ipAddress, attemptedAt: { gte: windowStart } },
  })

  return { allowed: count < RATE_LIMIT_MAX_ATTEMPTS }
}

export async function recordLoginAttempt(ipAddress: string): Promise<void> {
  await prisma.loginAttempt.create({ data: { ipAddress } })
}
```

- [ ] **Step 4: Write `src/test/auth.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignJWT } from 'jose'

const cookieStore = new Map<string, string>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value)
    },
    delete: (name: string) => {
      cookieStore.delete(name)
    },
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { loginAttempt: { deleteMany: vi.fn(), count: vi.fn(), create: vi.fn() } },
}))

beforeEach(() => {
  cookieStore.clear()
  vi.stubEnv('SESSION_SECRET', 'test-secret-at-least-32-bytes-long!!')
})

describe('verifySession', () => {
  it('returns false when no cookie is present', async () => {
    const { verifySession } = await import('@/lib/auth')
    expect(await verifySession()).toBe(false)
  })

  it('returns true for a session created via createSession()', async () => {
    const { createSession, verifySession } = await import('@/lib/auth')
    await createSession()
    expect(await verifySession()).toBe(true)
  })

  it('returns false for a malformed token', async () => {
    cookieStore.set('grim4rt_admin_session', 'not-a-real-jwt')
    const { verifySession } = await import('@/lib/auth')
    expect(await verifySession()).toBe(false)
  })

  it('returns false for an expired (but well-formed) token', async () => {
    const secret = new TextEncoder().encode('test-secret-at-least-32-bytes-long!!')
    const expiredToken = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 60 * 60 * 9)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60 * 60) // expired 1h ago
      .sign(secret)
    cookieStore.set('grim4rt_admin_session', expiredToken)
    const { verifySession } = await import('@/lib/auth')
    expect(await verifySession()).toBe(false)
  })

  it('returns false for a token signed with the wrong secret', async () => {
    const wrongSecret = new TextEncoder().encode('a-completely-different-secret-value')
    const token = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(wrongSecret)
    cookieStore.set('grim4rt_admin_session', token)
    const { verifySession } = await import('@/lib/auth')
    expect(await verifySession()).toBe(false)
  })
})

describe('requireAdmin', () => {
  it('redirects to /admin/login when the session is missing', async () => {
    const { requireAdmin } = await import('@/lib/auth')
    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/admin/login')
  })

  it('does not redirect when the session is valid', async () => {
    const { createSession, requireAdmin } = await import('@/lib/auth')
    await createSession()
    await expect(requireAdmin()).resolves.toBeUndefined()
  })
})

describe('destroySession', () => {
  it('removes the cookie so a subsequent verifySession() fails', async () => {
    const { createSession, destroySession, verifySession } = await import('@/lib/auth')
    await createSession()
    await destroySession()
    expect(await verifySession()).toBe(false)
  })
})
```

- [ ] **Step 5: Write `src/test/rate-limit.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const attempts: { ipAddress: string; attemptedAt: Date }[] = []

vi.mock('@/lib/prisma', () => ({
  prisma: {
    loginAttempt: {
      deleteMany: vi.fn(async ({ where }: { where: { ipAddress: string; attemptedAt: { lt: Date } } }) => {
        for (let i = attempts.length - 1; i >= 0; i--) {
          if (attempts[i].ipAddress === where.ipAddress && attempts[i].attemptedAt < where.attemptedAt.lt) {
            attempts.splice(i, 1)
          }
        }
      }),
      count: vi.fn(async ({ where }: { where: { ipAddress: string; attemptedAt: { gte: Date } } }) =>
        attempts.filter((a) => a.ipAddress === where.ipAddress && a.attemptedAt >= where.attemptedAt.gte).length
      ),
      create: vi.fn(async ({ data }: { data: { ipAddress: string } }) => {
        attempts.push({ ipAddress: data.ipAddress, attemptedAt: new Date() })
      }),
    },
  },
}))

beforeEach(() => {
  attempts.length = 0
})

describe('login rate limiting', () => {
  it('allows attempts under the limit', async () => {
    const { checkRateLimit, recordLoginAttempt } = await import('@/lib/auth')
    for (let i = 0; i < 4; i++) {
      expect((await checkRateLimit('1.2.3.4')).allowed).toBe(true)
      await recordLoginAttempt('1.2.3.4')
    }
  })

  it('blocks after 5 attempts within the 15-minute window', async () => {
    const { checkRateLimit, recordLoginAttempt } = await import('@/lib/auth')
    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt('5.6.7.8')
    }
    expect((await checkRateLimit('5.6.7.8')).allowed).toBe(false)
  })

  it('allows attempts again after old ones age out of the window', async () => {
    const { checkRateLimit } = await import('@/lib/auth')
    const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000)
    attempts.push(
      { ipAddress: '9.9.9.9', attemptedAt: sixteenMinutesAgo },
      { ipAddress: '9.9.9.9', attemptedAt: sixteenMinutesAgo },
      { ipAddress: '9.9.9.9', attemptedAt: sixteenMinutesAgo },
      { ipAddress: '9.9.9.9', attemptedAt: sixteenMinutesAgo },
      { ipAddress: '9.9.9.9', attemptedAt: sixteenMinutesAgo }
    )
    expect((await checkRateLimit('9.9.9.9')).allowed).toBe(true) // pruned first
    expect(attempts.filter((a) => a.ipAddress === '9.9.9.9')).toHaveLength(0)
  })

  it('tracks IPs independently', async () => {
    const { checkRateLimit, recordLoginAttempt } = await import('@/lib/auth')
    for (let i = 0; i < 5; i++) await recordLoginAttempt('1.1.1.1')
    expect((await checkRateLimit('1.1.1.1')).allowed).toBe(false)
    expect((await checkRateLimit('2.2.2.2')).allowed).toBe(true)
  })
})
```

- [ ] **Step 6: Run both test files**

Run: `npm run test:run -- src/test/auth.test.ts src/test/rate-limit.test.ts`
Expected: PASS (7 tests + 5 tests).

- [ ] **Step 7: Create `scripts/generate-password-hash.ts`**

```typescript
import { hash } from '@node-rs/argon2'

async function main() {
  const password = process.argv[2]
  if (!password) {
    console.error('Usage: npm run hash-password -- "<your password>"')
    process.exit(1)
  }
  const hashed = await hash(password)
  console.log('\nADMIN_PASSWORD_HASH=' + hashed + '\n')
  console.log('Copy the line above into your .env file.')
}

main()
```

Run once locally to generate a real value: `npm run hash-password -- "a strong password"`, then paste the printed `ADMIN_PASSWORD_HASH=...` line into `.env` (not `.env.example`).

- [ ] **Step 8: Create `src/lib/actions/auth-actions.ts`**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { verify } from '@node-rs/argon2'
import { createSession, destroySession, checkRateLimit, recordLoginAttempt } from '@/lib/auth'
import { loginSchema } from '@/lib/validation'

export interface LoginState {
  error: string | null
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ password: formData.get('password') })
  if (!parsed.success) {
    return { error: 'Contraseña inválida.' }
  }

  const headersList = await headers()
  // x-forwarded-for is the client IP Vercel's edge network sets on incoming
  // requests; it can be a comma-separated list, so take the first hop.
  const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const { allowed } = await checkRateLimit(ipAddress)
  if (!allowed) {
    // Deliberately the same generic message as a wrong password — no
    // distinction beyond the retry hint, per the design doc.
    return { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' }
  }

  const passwordHash = process.env.ADMIN_PASSWORD_HASH
  if (!passwordHash) {
    throw new Error('ADMIN_PASSWORD_HASH is not set')
  }

  const isValid = await verify(passwordHash, parsed.data.password)
  if (!isValid) {
    await recordLoginAttempt(ipAddress)
    return { error: 'Contraseña inválida.' }
  }

  await createSession()
  redirect('/admin')
}

export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect('/admin/login')
}
```

- [ ] **Step 9: Create `src/components/admin/LoginForm.tsx`** (Client Component — needs `useActionState` for pending/error UI)

```tsx
'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/lib/actions/auth-actions'

const initialState: LoginState = { error: null }

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState)

  return (
    <form action={formAction} className="w-full max-w-sm space-y-4">
      <label className="block text-sm">
        Contraseña
        <input
          type="password"
          name="password"
          required
          autoFocus
          className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1 text-brand-text"
        />
      </label>
      {state.error && <p className="text-brand-accentLight text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2 bg-brand-accent text-brand-text text-sm disabled:opacity-50"
      >
        {isPending ? 'Verificando…' : 'Entrar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 10: Create `src/app/admin/login/page.tsx`**

Deliberately outside the `(protected)` route group created in Task 8 — it must render without going through `requireAdmin()`, or logging in would redirect to itself.

```tsx
import { LoginForm } from '@/components/admin/LoginForm'

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-brand-black text-brand-text flex flex-col items-center justify-center px-6">
      <h1 className="font-display text-3xl mb-8">Grim4rt Admin</h1>
      <LoginForm />
    </div>
  )
}
```

- [ ] **Step 11: Create `proxy.ts`** (repo root — replaces the deprecated `middleware.ts` convention, per the design doc)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth-constants'

/**
 * Fast, lightweight gate: only checks that a session cookie is PRESENT, not
 * that it's valid. This is intentional — verifying signature/expiry here
 * would require importing jose (and, transitively, nothing heavy, but the
 * point still stands) into every matched request before a page even starts
 * rendering. The authoritative check is requireAdmin() in
 * src/app/admin/(protected)/layout.tsx and in every Server Action.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME)
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
```

- [ ] **Step 12: Verify the build succeeds**

Run: `npm run build`
Expected: succeeds. `/admin/login` should be listed as a route. (`/admin` itself doesn't exist yet — Task 8.)

- [ ] Commit this task's changes.

---

### Task 5: Cached public data layer (`src/lib/data.ts`) with Prisma-row mapping

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/data.ts`
- Test: `src/test/data-mapping.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `publicUrlFor` (Task 3).
- Produces: `getArtworks()`, `getCollections()`, `getCollectionBySlug(slug)`, `getSiteConfig()` — each `"use cache"` + `cacheTag`-wrapped, consumed by the three public route pages in Task 6. Extends `src/types/index.ts` with `SiteData` and `BioParagraphItem`.

**Decision — the mapping layer:** the DB schema (Task 2) stores bilingual fields flat (`titleEs`/`titleEn`, `nameEs`/`nameEn`, `taglineEs`/`taglineEn`, etc.) because that's what a relational schema needs. The existing app-wide `Artwork`/`Collection`/`SiteConfig` types (`src/types/index.ts`) use nested `Bilingual` objects (`{ es, en }`) instead, and every public component was written against that nested shape. Per the design doc's explicit goal ("existing public components keep their current prop shapes wherever possible"), `src/lib/data.ts` is the single place that reshapes flat Prisma rows into the existing nested types — no component, page, or Server Action outside this file should ever read `titleEs`/`titleEn` directly and reassemble a `Bilingual` object itself. Two consequences worth calling out explicitly:
- `Artwork.img` and `Collection.cover` become **full public Storage URLs** (via `publicUrlFor(row.imagePath)`), not the `"/filename.jpg"`-relative paths the static data files used. Every place currently rendering `src={`/${artwork.img}`}` must drop the leading-slash template once this lands (handled in Task 6).
- `SiteConfig` gains a sibling type, `SiteData`, extending it with `bio` (paragraphs + role/location/since) and `bioPhotoUrl` — because the design doc lists exactly four `lib/data.ts` functions (no separate `getBio()`), `getSiteConfig()` is the single site-wide data fetch and returns everything `Navbar`/`Footer`/`ContactSection`/`BioSection`/`HeroSlideshow` need, with each component still only destructuring the slice it actually uses.

- [ ] **Step 1: Extend `src/types/index.ts`**

Add these alongside the existing types (`Language`, `Bilingual`, `Artwork`, `Collection`, `NavItem`, `SiteConfig` are all unchanged):

```typescript
export interface BioParagraphItem extends Bilingual {
  id: string
}

export interface SiteData extends SiteConfig {
  bio: {
    paragraphs: BioParagraphItem[]
    role: Bilingual
    location: string
    since: string
  }
  bioPhotoUrl: string
}
```

- [ ] **Step 2: Create `src/lib/data.ts`**

```typescript
import { cacheTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { publicUrlFor } from '@/lib/storage'
import type {
  Artwork as PrismaArtwork,
  Collection as PrismaCollection,
  CollectionArtwork as PrismaCollectionArtwork,
} from '@prisma/client'
import type { Artwork, Collection, SiteData } from '@/types'

function toArtwork(row: PrismaArtwork): Artwork {
  return {
    id: row.id,
    type: row.type === 'PAINTING' ? 'painting' : 'drawing',
    img: publicUrlFor(row.imagePath),
    title: { es: row.titleEs, en: row.titleEn },
    technique: { es: row.techniqueEs, en: row.techniqueEn },
    size: row.size,
    year: row.year,
    price: row.price,
    status: row.status === 'AVAILABLE' ? 'available' : 'sold',
  }
}

type CollectionRow = PrismaCollection & {
  artworks: (PrismaCollectionArtwork & { artwork: PrismaArtwork })[]
}

function toCollection(row: CollectionRow): Collection {
  const coverMembership = row.artworks.find((a) => a.artworkId === row.coverArtworkId)
  const orderedMemberships = [...row.artworks].sort(
    (a, b) => a.position - b.position || a.artworkId.localeCompare(b.artworkId)
  )

  return {
    slug: row.slug,
    name: { es: row.nameEs, en: row.nameEn },
    cover: coverMembership ? publicUrlFor(coverMembership.artwork.imagePath) : '',
    workIds: orderedMemberships.map((a) => a.artworkId),
  }
}

export async function getArtworks(): Promise<Artwork[]> {
  'use cache'
  cacheTag('artworks')

  const rows = await prisma.artwork.findMany({
    where: { isPublished: true },
    // Secondary `id` sort is a deterministic tiebreaker in case two rows ever
    // share a displayOrder value (see design doc's ordering decisions).
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  })
  return rows.map(toArtwork)
}

export async function getCollections(): Promise<Collection[]> {
  'use cache'
  cacheTag('collections')

  const rows = await prisma.collection.findMany({
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    include: {
      artworks: {
        include: { artwork: true },
        where: { artwork: { isPublished: true } },
      },
    },
  })
  return rows.map(toCollection)
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  'use cache'
  cacheTag('collections')
  cacheTag(`collection:${slug}`)

  const row = await prisma.collection.findUnique({
    where: { slug },
    include: {
      artworks: {
        include: { artwork: true },
        where: { artwork: { isPublished: true } },
        orderBy: [{ position: 'asc' }, { artworkId: 'asc' }],
      },
    },
  })
  if (!row) return null
  return toCollection(row)
}

export async function getSiteConfig(): Promise<SiteData> {
  'use cache'
  cacheTag('site-config')

  const [config, paragraphs] = await Promise.all([
    prisma.siteConfig.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.bioParagraph.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
  ])

  return {
    name: config.name,
    tagline: { es: config.taglineEs, en: config.taglineEn },
    email: config.email,
    phone: config.phone,
    whatsapp: config.whatsapp,
    instagramPersonal: config.instagramPersonal,
    instagramStudio: config.instagramStudio,
    bio: {
      paragraphs: paragraphs.map((p) => ({ id: p.id, es: p.textEs, en: p.textEn })),
      role: { es: config.bioRoleEs, en: config.bioRoleEn },
      location: config.bioLocation,
      since: config.bioSince,
    },
    bioPhotoUrl: publicUrlFor(config.bioPhotoPath),
  }
}
```

- [ ] **Step 3: Write `src/test/data-mapping.test.ts`**

This tests the mapping functions in isolation against a mocked `prisma`/`storage`, without a real database — confirming the flat-to-nested reshape and the secondary `id` ordering tiebreaker described above.

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/storage', () => ({
  publicUrlFor: (path: string) => `https://cdn.example/artwork-images/${path}`,
}))

const artworkRows = [
  {
    id: 'art-2', type: 'DRAWING', imagePath: 'artworks/art-2/x.jpg',
    titleEs: 'Boceto', titleEn: 'Sketch', techniqueEs: 'Carboncillo', techniqueEn: 'Charcoal',
    size: '10x10', year: '2026', price: '$1', status: 'SOLD', displayOrder: 0, isPublished: true,
  },
  {
    id: 'art-1', type: 'PAINTING', imagePath: 'artworks/art-1/y.jpg',
    titleEs: 'Anhelo', titleEn: 'Longing', techniqueEs: 'Óleo', techniqueEn: 'Oil',
    size: '20x20', year: '2026', price: '$2', status: 'AVAILABLE', displayOrder: 0, isPublished: true,
  },
]

const findManyMock = vi.fn(async () => artworkRows)
const findUniqueMock = vi.fn()
const findUniqueOrThrowMock = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artwork: { findMany: (...args: unknown[]) => findManyMock(...args) },
    collection: { findMany: vi.fn(async () => []), findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    bioParagraph: { findMany: vi.fn(async () => []) },
    siteConfig: { findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrowMock(...args) },
  },
}))

describe('getArtworks mapping', () => {
  it('maps flat Prisma rows into nested Bilingual-shaped Artwork objects', async () => {
    const { getArtworks } = await import('@/lib/data')
    const result = await getArtworks()
    expect(result[1]).toEqual({
      id: 'art-1',
      type: 'painting',
      img: 'https://cdn.example/artwork-images/artworks/art-1/y.jpg',
      title: { es: 'Anhelo', en: 'Longing' },
      technique: { es: 'Óleo', en: 'Oil' },
      size: '20x20',
      year: '2026',
      price: '$2',
      status: 'available',
    })
  })

  it('queries only published artworks, ordered by displayOrder then id', async () => {
    const { getArtworks } = await import('@/lib/data')
    await getArtworks()
    expect(findManyMock).toHaveBeenCalledWith({
      where: { isPublished: true },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    })
  })
})

describe('getCollectionBySlug mapping', () => {
  it('returns null for a nonexistent slug', async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    const { getCollectionBySlug } = await import('@/lib/data')
    expect(await getCollectionBySlug('nope')).toBeNull()
  })

  it('sorts CollectionArtwork rows by position, tiebreaking on artworkId when positions collide', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'col-1', slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies',
      displayOrder: 0, coverArtworkId: 'art-1',
      artworks: [
        { artworkId: 'art-2', position: 0, artwork: { id: 'art-2', imagePath: 'artworks/art-2/x.jpg', isPublished: true } },
        { artworkId: 'art-1', position: 0, artwork: { id: 'art-1', imagePath: 'artworks/art-1/y.jpg', isPublished: true } },
      ],
    })
    const { getCollectionBySlug } = await import('@/lib/data')
    const result = await getCollectionBySlug('estudios')
    expect(result?.workIds).toEqual(['art-1', 'art-2']) // tiebroken alphabetically by artworkId
    expect(result?.cover).toBe('https://cdn.example/artwork-images/artworks/art-1/y.jpg')
  })
})

describe('getSiteConfig mapping', () => {
  it('reshapes flat SiteConfig + BioParagraph rows into SiteData', async () => {
    findUniqueOrThrowMock.mockResolvedValueOnce({
      id: 1, name: 'Daniel Grimaldi', taglineEs: 'Tag ES', taglineEn: 'Tag EN',
      email: 'a@b.com', phone: '123', whatsapp: '584', instagramPersonal: 'x', instagramStudio: 'y',
      bioRoleEs: 'Rol', bioRoleEn: 'Role', bioLocation: 'Valencia', bioSince: 'Desde 2021',
      bioPhotoPath: 'site/bio-photo.jpg',
    })
    const { getSiteConfig } = await import('@/lib/data')
    const result = await getSiteConfig()
    expect(result.tagline).toEqual({ es: 'Tag ES', en: 'Tag EN' })
    expect(result.bio.role).toEqual({ es: 'Rol', en: 'Role' })
    expect(result.bioPhotoUrl).toBe('https://cdn.example/artwork-images/site/bio-photo.jpg')
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npm run test:run -- src/test/data-mapping.test.ts`
Expected: PASS (5 tests).

- [ ] Commit this task's changes.

---

### Task 6: Refactor public components and route pages to prop-driven rendering

**Files:**
- Modify: `src/components/ui/ArtworkCard.tsx`
- Modify: `src/components/ui/Lightbox.tsx`
- Delete: `src/lib/image-orientation.ts`
- Delete: `src/test/image-orientation.test.ts`
- Modify: `src/components/sections/HeroSlideshow.tsx`
- Modify: `src/components/sections/WorksGallery.tsx`
- Modify: `src/components/sections/BioSection.tsx`
- Modify: `src/components/sections/ContactSection.tsx`
- Modify: `src/components/layout/Navbar.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/components/layout/WhatsAppButton.tsx`
- Modify: `src/components/collections/CollectionsGrid.tsx`
- Modify: `src/components/collections/CollectionDetail.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/colecciones/page.tsx`
- Modify: `src/app/colecciones/[slug]/page.tsx`
- Modify: `src/test/ArtworkCard.test.tsx`, `src/test/Lightbox.test.tsx`, `src/test/HeroSlideshow.test.tsx`, `src/test/WorksGallery.test.tsx`, `src/test/BioSection.test.tsx`, `src/test/ContactSection.test.tsx`, `src/test/Navbar.test.tsx`, `src/test/Footer.test.tsx`, `src/test/WhatsAppButton.test.tsx`, `src/test/CollectionsGrid.test.tsx`, `src/test/CollectionDetail.test.tsx`

**Interfaces:**
- Consumes: `getArtworks`, `getCollections`, `getCollectionBySlug`, `getSiteConfig` (Task 5).
- Produces: every component below now takes its data as props (per the design doc's "Public component changes" table) instead of importing `src/data/*` directly.

**Decision — dropping the portrait/landscape dual-grid split:** `ArtworkCard` and `WorksGallery` currently call `isLandscape(artwork.img)` (`src/lib/image-orientation.ts`) — a hardcoded filename-to-orientation lookup table — to decide an aspect-ratio class and to split the gallery into two grids so landscape pieces start a fresh row. Once `Artwork.img` becomes a full Storage public URL (Task 5's mapping decision) instead of a bare filename like `Caballo.jpg`, this lookup can never match again for any artwork migrated or created after this point — worse, every artwork created through the admin panel is stored at `artworks/{artworkId}/{uploadId}.{ext}` (Task 7), which has no relationship to an original filename at all. The design doc doesn't mention preserving this presentational split as a requirement, and the schema (which this plan must not alter) has no per-artwork orientation column to reconstruct it properly. Given that, `ArtworkCard` moves to a single fixed `aspect-[4/5]` frame (object-cover crops any real aspect gracefully) and `WorksGallery` renders one unified grid — `src/lib/image-orientation.ts` and its test are deleted as dead code rather than left as a silently-broken dependency.

**Decision — dropping `generateStaticParams` from `/colecciones/[slug]`:** collection slugs are now dynamic DB content, not a fixed compile-time array. `getCollectionBySlug` is already `"use cache"`-backed (Task 5), so there's no performance reason to also pre-render static params at build time — every request is served from cache after the first read, and `notFound()` still fires correctly for slugs that don't exist.

- [ ] **Step 1: Update `src/components/ui/ArtworkCard.tsx`** — drop the `isLandscape` import/usage, render `artwork.img` directly (no leading-slash template, since it's now a full URL)

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
      className="group cursor-pointer border border-brand-border bg-brand-card h-full flex flex-col"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artwork.img}
          alt={artwork.title.es}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <span
          className={`text-xs uppercase tracking-wide ${
            artwork.status === 'sold' ? 'text-red-500' : 'text-green-500'
          }`}
        >
          {statusLabel[language]}
        </span>
        <h3 className="font-display text-xl mt-1 truncate">{artwork.title[language]}</h3>
        <div className="text-xs text-brand-muted mt-2 space-y-0.5">
          <div className="truncate">{artwork.technique[language]}</div>
          <div>{artwork.size}</div>
          <div>{artwork.year}</div>
        </div>
        <div className="mt-auto pt-2 text-sm text-brand-text">{formatPrice(artwork.price)}</div>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Update `src/test/ArtworkCard.test.tsx`** — realistic URL fixture + a new test locking in the "no leading-slash rewrite" contract

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { ArtworkCard } from '@/components/ui/ArtworkCard'
import type { Artwork } from '@/types'

const sampleArtwork: Artwork = {
  id: 'obra9999',
  type: 'painting',
  img: 'https://cdn.example.supabase.co/storage/v1/object/public/artwork-images/artworks/obra9999/sample.jpg',
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

  it('renders the image at the exact artwork.img URL, with no leading-slash rewrite', () => {
    render(
      <LanguageProvider>
        <ArtworkCard artwork={sampleArtwork} />
      </LanguageProvider>
    )
    expect(screen.getByAltText('Título de Prueba')).toHaveAttribute('src', sampleArtwork.img)
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

- [ ] **Step 3: Update `src/components/ui/Lightbox.tsx`** — same URL-format fix, no prop-shape change

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
              src={artwork.img}
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

- [ ] **Step 4: Update `src/test/Lightbox.test.tsx`** — realistic URL fixture + a src assertion

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { Lightbox } from '@/components/ui/Lightbox'
import type { Artwork } from '@/types'

const sampleArtwork: Artwork = {
  id: 'obra9999',
  type: 'painting',
  img: 'https://cdn.example.supabase.co/storage/v1/object/public/artwork-images/artworks/obra9999/sample.jpg',
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

  it('renders the artwork title and image (at the exact artwork.img URL) when provided', () => {
    render(
      <LanguageProvider>
        <Lightbox artwork={sampleArtwork} onClose={vi.fn()} />
      </LanguageProvider>
    )
    expect(screen.getByText('Título de Prueba')).toBeInTheDocument()
    expect(screen.getByAltText('Título de Prueba')).toHaveAttribute('src', sampleArtwork.img)
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

- [ ] **Step 5: Delete `src/lib/image-orientation.ts` and `src/test/image-orientation.test.ts`**

Run: `rm src/lib/image-orientation.ts src/test/image-orientation.test.ts`

- [ ] **Step 6: Run the tests touched so far**

Run: `npm run test:run -- src/test/ArtworkCard.test.tsx src/test/Lightbox.test.tsx`
Expected: PASS (6 tests + 4 tests). No `image-orientation` test file should remain to fail or be picked up.

- [ ] **Step 7: Update `src/components/sections/HeroSlideshow.tsx`** — `artworks` and `siteConfig` become props; `heroContent.eyebrow` stays a static import (non-editable structural copy, per the design doc's non-goals)

```tsx
'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { heroContent } from '@/data/site'
import { useLanguage } from '@/lib/language-context'
import type { Artwork, SiteConfig } from '@/types'

const SLIDE_INTERVAL_MS = 5000

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function HeroSlideshow({ artworks, siteConfig }: { artworks: Artwork[]; siteConfig: SiteConfig }) {
  const { language } = useLanguage()
  // Deterministic initial order (matches server render) — shuffled client-side
  // after mount in the effect below, so hydration never mismatches.
  const [images, setImages] = useState(() => artworks.map((a) => a.img))
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImages(shuffle(artworks.map((a) => a.img)))
  }, [artworks])

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
          style={{ backgroundImage: `url(${images[activeIndex]})` }}
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

- [ ] **Step 8: Update `src/test/HeroSlideshow.test.tsx`**

```tsx
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { HeroSlideshow } from '@/components/sections/HeroSlideshow'
import type { Artwork, SiteConfig } from '@/types'

const sampleArtworks: Artwork[] = [
  { id: 'a1', type: 'painting', img: 'https://cdn.example/a1.jpg', title: { es: 'A1', en: 'A1' }, technique: { es: 'x', en: 'x' }, size: '1', year: '2026', price: '$1', status: 'available' },
  { id: 'a2', type: 'painting', img: 'https://cdn.example/a2.jpg', title: { es: 'A2', en: 'A2' }, technique: { es: 'x', en: 'x' }, size: '1', year: '2026', price: '$1', status: 'available' },
]

const sampleSiteConfig: SiteConfig = {
  name: 'Daniel Grimaldi',
  tagline: {
    es: 'Pintura que habita el territorio del anhelo.',
    en: 'Painting that inhabits the territory of longing.',
  },
  email: 'a@b.com',
  phone: '123',
  whatsapp: '584',
  instagramPersonal: 'https://instagram.com/x',
  instagramStudio: 'https://instagram.com/y',
}

describe('HeroSlideshow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the artist name and tagline from props', () => {
    render(
      <LanguageProvider>
        <HeroSlideshow artworks={sampleArtworks} siteConfig={sampleSiteConfig} />
      </LanguageProvider>
    )
    expect(screen.getByText('Daniel')).toBeInTheDocument()
    expect(screen.getByText('Grimaldi')).toBeInTheDocument()
    expect(screen.getByText('Pintura que habita el territorio del anhelo.')).toBeInTheDocument()
  })

  it('renders exactly one active background slide using the artwork.img URL as-is', () => {
    render(
      <LanguageProvider>
        <HeroSlideshow artworks={sampleArtworks} siteConfig={sampleSiteConfig} />
      </LanguageProvider>
    )
    const slides = screen.getAllByTestId('hero-slide')
    expect(slides).toHaveLength(1)
    expect(slides[0].style.backgroundImage).toMatch(/cdn\.example/)
  })

  it('advances to a different background image after 5 seconds', () => {
    render(
      <LanguageProvider>
        <HeroSlideshow artworks={sampleArtworks} siteConfig={sampleSiteConfig} />
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

- [ ] **Step 9: Update `src/components/sections/WorksGallery.tsx`** — `artworks` becomes a prop; single unified grid (see the dual-grid decision above)

```tsx
'use client'
import { useState, useMemo } from 'react'
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

export function WorksGallery({ artworks }: { artworks: Artwork[] }) {
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
    [artworks, typeFilter, statusFilter]
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

- [ ] **Step 10: Update `src/test/WorksGallery.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { WorksGallery } from '@/components/sections/WorksGallery'
import type { Artwork } from '@/types'

const sampleArtworks: Artwork[] = [
  { id: 'obra4694', type: 'painting', img: 'https://cdn.example/anhelo.jpg', title: { es: 'Anhelo', en: 'Longing' }, technique: { es: 'x', en: 'x' }, size: '1', year: '2026', price: '$1', status: 'sold' },
  { id: 'obra5038', type: 'painting', img: 'https://cdn.example/volumen.jpg', title: { es: 'Volumen Esencial', en: 'Essential Volume' }, technique: { es: 'x', en: 'x' }, size: '1', year: '2026', price: '$1', status: 'available' },
  { id: 'obra0405', type: 'drawing', img: 'https://cdn.example/estudio.jpg', title: { es: 'Estudio de Movimiento', en: 'Movement Study' }, technique: { es: 'x', en: 'x' }, size: '1', year: '2026', price: '$1', status: 'sold' },
]

function renderGallery() {
  return render(
    <LanguageProvider>
      <WorksGallery artworks={sampleArtworks} />
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

- [ ] **Step 11: Update `src/components/sections/BioSection.tsx`** — `bio` and `bioPhotoUrl` become props

```tsx
'use client'
import { useLanguage } from '@/lib/language-context'
import type { SiteData } from '@/types'

export function BioSection({ bio, bioPhotoUrl }: { bio: SiteData['bio']; bioPhotoUrl: string }) {
  const { language } = useLanguage()

  return (
    <section id="bio" className="max-w-[1440px] mx-auto px-6 md:px-10 py-16 grid md:grid-cols-[1fr_2fr_1fr] gap-10">
      <div className="aspect-[884/546] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bioPhotoUrl}
          alt="Daniel Grimaldi en su taller"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="space-y-4 text-brand-text/90">
        {bio.paragraphs.map((paragraph) => (
          <p key={paragraph.id}>{paragraph[language]}</p>
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

- [ ] **Step 12: Update `src/test/BioSection.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import { BioSection } from '@/components/sections/BioSection'
import type { SiteData } from '@/types'

const sampleBio: SiteData['bio'] = {
  paragraphs: [
    {
      id: 'p1',
      es: 'Daniel Grimaldi Assef (Valencia, Venezuela, 2001) es un artista visual cuya práctica...',
      en: 'Daniel Grimaldi Assef (Valencia, Venezuela, 2001) is a visual artist whose practice...',
    },
  ],
  role: { es: 'Artista Plástico', en: 'Visual Artist' },
  location: 'Valencia, Venezuela',
  since: 'Desde 2021',
}

describe('BioSection', () => {
  it('renders the Spanish bio paragraphs by default', () => {
    render(
      <LanguageProvider>
        <BioSection bio={sampleBio} bioPhotoUrl="https://cdn.example/bio.jpg" />
      </LanguageProvider>
    )
    expect(screen.getByText(/Daniel Grimaldi Assef \(Valencia, Venezuela, 2001\) es un artista visual/)).toBeInTheDocument()
  })

  it('renders the English bio paragraphs after toggling language', () => {
    render(
      <LanguageProvider>
        <LanguageToggle />
        <BioSection bio={sampleBio} bioPhotoUrl="https://cdn.example/bio.jpg" />
      </LanguageProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText(/Daniel Grimaldi Assef \(Valencia, Venezuela, 2001\) is a visual artist/)).toBeInTheDocument()
  })

  it('renders the role, location, and bio photo from props', () => {
    render(
      <LanguageProvider>
        <BioSection bio={sampleBio} bioPhotoUrl="https://cdn.example/bio.jpg" />
      </LanguageProvider>
    )
    expect(screen.getByText('Artista Plástico')).toBeInTheDocument()
    expect(screen.getByText('Valencia, Venezuela')).toBeInTheDocument()
    expect(screen.getByAltText('Daniel Grimaldi en su taller')).toHaveAttribute('src', 'https://cdn.example/bio.jpg')
  })
})
```

- [ ] **Step 13: Update `src/components/sections/ContactSection.tsx`** — `siteConfig` becomes a prop

```tsx
'use client'
import { Mail, Phone, Briefcase } from 'lucide-react'
import { InstagramIcon } from '@/components/ui/InstagramIcon'
import { useLanguage } from '@/lib/language-context'
import type { SiteConfig } from '@/types'

export function ContactSection({ siteConfig }: { siteConfig: SiteConfig }) {
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
        <a href={`mailto:${siteConfig.email}`} className="flex items-center gap-2 hover:text-brand-accentLight transition-colors">
          <Mail size={16} className="shrink-0" />
          {siteConfig.email}
        </a>
        <a href={`tel:${siteConfig.phone.replace(/\D/g, '')}`} className="flex items-center gap-2 hover:text-brand-accentLight transition-colors">
          <Phone size={16} className="shrink-0" />
          {siteConfig.phone}
        </a>
        <a href={siteConfig.instagramPersonal} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-accentLight transition-colors">
          <InstagramIcon size={16} className="shrink-0" />
          @daniel_grimaldi
        </a>
        <a href={siteConfig.instagramStudio} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-accentLight transition-colors">
          <Briefcase size={16} className="shrink-0" />
          @grim4rt_
        </a>
      </div>
    </section>
  )
}
```

- [ ] **Step 14: Update `src/test/ContactSection.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { ContactSection } from '@/components/sections/ContactSection'
import type { SiteConfig } from '@/types'

const sampleSiteConfig: SiteConfig = {
  name: 'Daniel Grimaldi',
  tagline: { es: 'x', en: 'x' },
  email: 'danieco.comics@gmail.com',
  phone: '04244-359019',
  whatsapp: '584244359019',
  instagramPersonal: 'https://instagram.com/daniel_grimaldi',
  instagramStudio: 'https://instagram.com/grim4rt_',
}

describe('ContactSection', () => {
  it('renders a mailto link with the correct address', () => {
    render(
      <LanguageProvider>
        <ContactSection siteConfig={sampleSiteConfig} />
      </LanguageProvider>
    )
    const emailLink = screen.getByRole('link', { name: /danieco.comics@gmail.com/ })
    expect(emailLink).toHaveAttribute('href', 'mailto:danieco.comics@gmail.com')
  })

  it('renders a tel link with the correct number', () => {
    render(
      <LanguageProvider>
        <ContactSection siteConfig={sampleSiteConfig} />
      </LanguageProvider>
    )
    const phoneLink = screen.getByRole('link', { name: /04244-359019/ })
    expect(phoneLink).toHaveAttribute('href', 'tel:04244359019')
  })

  it('renders both Instagram links', () => {
    render(
      <LanguageProvider>
        <ContactSection siteConfig={sampleSiteConfig} />
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

- [ ] **Step 15: Update `src/components/layout/Navbar.tsx`** — `siteConfig` becomes a prop; `navItems` stays a static import (non-editable per design doc's non-goals)

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { navItems } from '@/data/site'
import { useLanguage } from '@/lib/language-context'
import { LanguageToggle } from '@/components/layout/LanguageToggle'
import type { SiteConfig } from '@/types'

export function Navbar({ siteConfig }: { siteConfig: SiteConfig }) {
  const { language } = useLanguage()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 border-b border-brand-text/10 glass-nav ${
        scrolled ? 'glass-nav--scrolled' : ''
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 flex items-center justify-between h-16 md:h-20">
        <Link href="/" className="font-display text-lg tracking-wide text-brand-text">
          {siteConfig.name}
        </Link>

        <nav aria-label="Navegación principal" className="hidden md:flex items-center gap-6 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link text-brand-text/80 hover:text-brand-text transition-colors"
            >
              {item.label[language]}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <LanguageToggle />
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? (language === 'es' ? 'Cerrar menú' : 'Close menu') : language === 'es' ? 'Abrir menú' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          className="md:hidden flex items-center justify-center w-10 h-10 -mr-2 text-brand-text"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-nav"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden overflow-hidden glass-panel border-t border-brand-text/10"
          >
            <nav
              aria-label="Navegación móvil"
              className="max-w-[1440px] mx-auto px-6 py-6 flex flex-col gap-1"
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="py-3 text-lg font-display text-brand-text/90 hover:text-brand-text border-b border-brand-text/5 last:border-b-0"
                >
                  {item.label[language]}
                </Link>
              ))}
              <div className="pt-5">
                <LanguageToggle />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
```

- [ ] **Step 16: Update `src/test/Navbar.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { Navbar } from '@/components/layout/Navbar'
import type { SiteConfig } from '@/types'

const sampleSiteConfig: SiteConfig = {
  name: 'Daniel Grimaldi',
  tagline: { es: 'x', en: 'x' },
  email: 'a@b.com',
  phone: '123',
  whatsapp: '584',
  instagramPersonal: 'https://instagram.com/x',
  instagramStudio: 'https://instagram.com/y',
}

function renderNavbar() {
  return render(
    <LanguageProvider>
      <Navbar siteConfig={sampleSiteConfig} />
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

  it('renders the site name from props', () => {
    renderNavbar()
    expect(screen.getByText('Daniel Grimaldi')).toBeInTheDocument()
  })
})
```

- [ ] **Step 17: Update `src/components/layout/Footer.tsx`** — `siteConfig` and `bio` become props; `navItems` stays static

```tsx
'use client'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { InstagramIcon } from '@/components/ui/InstagramIcon'
import { navItems } from '@/data/site'
import { useLanguage } from '@/lib/language-context'
import type { SiteConfig, SiteData } from '@/types'

export function Footer({ siteConfig, bio }: { siteConfig: SiteConfig; bio: SiteData['bio'] }) {
  const { language } = useLanguage()
  const rights = language === 'es' ? 'Todos los derechos reservados' : 'All rights reserved'
  const navigationLabel = language === 'es' ? 'Navegación' : 'Navigation'
  const followLabel = language === 'es' ? 'Sígueme' : 'Follow'

  return (
    <footer className="border-t border-brand-border bg-brand-black">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 py-16">
        <div className="grid md:grid-cols-3 gap-12 pb-12 border-b border-brand-border">
          <div>
            <span className="font-display text-xl">{siteConfig.name}</span>
            <p className="text-sm text-brand-muted mt-3 max-w-xs">{siteConfig.tagline[language]}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-brand-muted mb-5">
              {navigationLabel}
            </p>
            <ul className="flex flex-col gap-3">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-brand-text/80 hover:text-brand-accentLight transition-colors"
                  >
                    {item.label[language]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-brand-muted mb-5">
              {followLabel}
            </p>
            <ul className="flex flex-col gap-3">
              <li>
                <a
                  href={siteConfig.instagramPersonal}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-brand-text/80 hover:text-brand-accentLight transition-colors"
                >
                  <InstagramIcon size={14} className="shrink-0" />
                  @daniel_grimaldi
                </a>
              </li>
              <li>
                <a
                  href={siteConfig.instagramStudio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-brand-text/80 hover:text-brand-accentLight transition-colors"
                >
                  <InstagramIcon size={14} className="shrink-0" />
                  @grim4rt_
                </a>
              </li>
              <li className="flex items-center gap-2 text-sm text-brand-muted">
                <MapPin size={14} className="shrink-0" />
                {bio.location}
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-8 text-xs text-brand-muted">
          <span>{siteConfig.name} © 2026</span>
          <span>{rights}</span>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 18: Update `src/test/Footer.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { Footer } from '@/components/layout/Footer'
import type { SiteConfig, SiteData } from '@/types'

const sampleSiteConfig: SiteConfig = {
  name: 'Daniel Grimaldi',
  tagline: { es: 'x', en: 'x' },
  email: 'a@b.com',
  phone: '123',
  whatsapp: '584',
  instagramPersonal: 'https://instagram.com/x',
  instagramStudio: 'https://instagram.com/y',
}

const sampleBio: SiteData['bio'] = {
  paragraphs: [],
  role: { es: 'Artista Plástico', en: 'Visual Artist' },
  location: 'Valencia, Venezuela',
  since: 'Desde 2021',
}

describe('Footer', () => {
  it('renders the copyright line using the site name from props', () => {
    render(
      <LanguageProvider>
        <Footer siteConfig={sampleSiteConfig} bio={sampleBio} />
      </LanguageProvider>
    )
    expect(screen.getByText(/Daniel Grimaldi © 2026/)).toBeInTheDocument()
  })

  it('renders the Spanish rights line by default', () => {
    render(
      <LanguageProvider>
        <Footer siteConfig={sampleSiteConfig} bio={sampleBio} />
      </LanguageProvider>
    )
    expect(screen.getByText('Todos los derechos reservados')).toBeInTheDocument()
  })

  it('renders the bio location from props', () => {
    render(
      <LanguageProvider>
        <Footer siteConfig={sampleSiteConfig} bio={sampleBio} />
      </LanguageProvider>
    )
    expect(screen.getByText('Valencia, Venezuela')).toBeInTheDocument()
  })
})
```

- [ ] **Step 19: Update `src/components/layout/WhatsAppButton.tsx`** — becomes an `async` Server Component calling `getSiteConfig()` itself (it was already the one component in this codebase without `'use client'`)

```tsx
import { getSiteConfig } from '@/lib/data'

export async function WhatsAppButton() {
  const { whatsapp } = await getSiteConfig()
  const whatsappUrl = `https://wa.me/${whatsapp}`

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

- [ ] **Step 20: Update `src/test/WhatsAppButton.test.tsx`** — mocks `@/lib/data`; since a Server Component is just an async function, `await`-ing it directly and rendering the resolved element is the standard way to unit test one

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/data', () => ({
  getSiteConfig: vi.fn(async () => ({ whatsapp: '584244359019' })),
}))

import { WhatsAppButton } from '@/components/layout/WhatsAppButton'

describe('WhatsAppButton', () => {
  it('links to the correct wa.me URL', async () => {
    render(await WhatsAppButton())
    const link = screen.getByRole('link', { name: /whatsapp/i })
    expect(link).toHaveAttribute('href', 'https://wa.me/584244359019')
  })

  it('opens in a new tab', async () => {
    render(await WhatsAppButton())
    const link = screen.getByRole('link', { name: /whatsapp/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
```

- [ ] **Step 21: Update `src/components/collections/CollectionsGrid.tsx`** — `collections` becomes a prop; cover URL rendered as-is

```tsx
'use client'
import Link from 'next/link'
import { useLanguage } from '@/lib/language-context'
import type { Collection } from '@/types'

export function CollectionsGrid({ collections }: { collections: Collection[] }) {
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
            className="group block border border-brand-border bg-brand-card h-full flex flex-col"
          >
            <div className="aspect-[4/3] overflow-hidden bg-brand-dark">
              {collection.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={collection.cover}
                  alt={collection.name.es}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </div>
            <div className="p-4 flex-1 flex flex-col">
              <h3 className="font-display text-xl">{collection.name[language]}</h3>
              <p className="text-xs text-brand-muted mt-auto pt-1">
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

- [ ] **Step 22: Update `src/test/CollectionsGrid.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { CollectionsGrid } from '@/components/collections/CollectionsGrid'
import type { Collection } from '@/types'

const sampleCollections: Collection[] = [
  { slug: 'toros', name: { es: 'Toros', en: 'Bulls' }, cover: '', workIds: [] },
  { slug: 'bailarinas', name: { es: 'Bailarinas', en: 'Dancers' }, cover: '', workIds: [] },
  { slug: 'figura-humana', name: { es: 'Figura Humana', en: 'Human Figure' }, cover: 'https://cdn.example/anhelo.jpg', workIds: ['a', 'b'] },
  { slug: 'estudios', name: { es: 'Estudios', en: 'Studies' }, cover: 'https://cdn.example/estudio.jpg', workIds: ['c', 'd'] },
]

describe('CollectionsGrid', () => {
  it('renders all four collection names in Spanish by default', () => {
    render(
      <LanguageProvider>
        <CollectionsGrid collections={sampleCollections} />
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
        <CollectionsGrid collections={sampleCollections} />
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
        <CollectionsGrid collections={sampleCollections} />
      </LanguageProvider>
    )
    const figuraCard = screen.getByText('Figura Humana').closest('a')
    expect(figuraCard).toHaveTextContent('2 obras')
  })
})
```

- [ ] **Step 23: Update `src/components/collections/CollectionDetail.tsx`** — `collection`/`works` become props; the slug lookup moves to the route page (Step 27)

```tsx
'use client'
import { useLanguage } from '@/lib/language-context'
import { ArtworkCard } from '@/components/ui/ArtworkCard'
import { BackButton } from '@/components/ui/BackButton'
import type { Artwork, Collection } from '@/types'

export function CollectionDetail({ collection, works }: { collection: Collection; works: Artwork[] }) {
  const { language } = useLanguage()

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

- [ ] **Step 24: Update `src/test/CollectionDetail.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LanguageProvider } from '@/lib/language-context'
import { CollectionDetail } from '@/components/collections/CollectionDetail'
import type { Artwork, Collection } from '@/types'

const sampleCollection: Collection = {
  slug: 'figura-humana',
  name: { es: 'Figura Humana', en: 'Human Figure' },
  cover: '',
  workIds: ['a', 'b'],
}

const sampleWorks: Artwork[] = [
  { id: 'a', type: 'painting', img: 'https://cdn.example/anhelo.jpg', title: { es: 'Anhelo', en: 'Longing' }, technique: { es: 'x', en: 'x' }, size: '1', year: '2026', price: '$1', status: 'available' },
  { id: 'b', type: 'painting', img: 'https://cdn.example/volumen.jpg', title: { es: 'Volumen Esencial', en: 'Essential Volume' }, technique: { es: 'x', en: 'x' }, size: '1', year: '2026', price: '$1', status: 'available' },
]

const emptyCollection: Collection = { slug: 'toros', name: { es: 'Toros', en: 'Bulls' }, cover: '', workIds: [] }

describe('CollectionDetail', () => {
  it('renders the collection name and work count', () => {
    render(
      <LanguageProvider>
        <CollectionDetail collection={sampleCollection} works={sampleWorks} />
      </LanguageProvider>
    )
    expect(screen.getByText('Figura Humana')).toBeInTheDocument()
    expect(screen.getByText('2 obras en esta colección')).toBeInTheDocument()
  })

  it("renders each of the collection's artworks", () => {
    render(
      <LanguageProvider>
        <CollectionDetail collection={sampleCollection} works={sampleWorks} />
      </LanguageProvider>
    )
    expect(screen.getByText('Anhelo')).toBeInTheDocument()
    expect(screen.getByText('Volumen Esencial')).toBeInTheDocument()
  })

  it('renders a back link to /colecciones', () => {
    render(
      <LanguageProvider>
        <CollectionDetail collection={sampleCollection} works={sampleWorks} />
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
        <CollectionDetail collection={emptyCollection} works={[]} />
      </LanguageProvider>
    )
    expect(screen.getByText('Esta colección aún no tiene obras.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 25: Run every touched component test file**

Run: `npm run test:run -- src/test/HeroSlideshow.test.tsx src/test/WorksGallery.test.tsx src/test/BioSection.test.tsx src/test/ContactSection.test.tsx src/test/Navbar.test.tsx src/test/Footer.test.tsx src/test/WhatsAppButton.test.tsx src/test/CollectionsGrid.test.tsx src/test/CollectionDetail.test.tsx`
Expected: PASS (all tests across all 9 files).

- [ ] **Step 26: Update `src/app/page.tsx`**

```tsx
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'
import { HeroSlideshow } from '@/components/sections/HeroSlideshow'
import { WorksGallery } from '@/components/sections/WorksGallery'
import { BioSection } from '@/components/sections/BioSection'
import { ContactSection } from '@/components/sections/ContactSection'
import { getArtworks, getSiteConfig } from '@/lib/data'

export default async function Home() {
  const [artworks, siteConfig] = await Promise.all([getArtworks(), getSiteConfig()])

  return (
    <>
      <Navbar siteConfig={siteConfig} />
      <main>
        <HeroSlideshow artworks={artworks} siteConfig={siteConfig} />
        <WorksGallery artworks={artworks} />
        <BioSection bio={siteConfig.bio} bioPhotoUrl={siteConfig.bioPhotoUrl} />
        <ContactSection siteConfig={siteConfig} />
      </main>
      <Footer siteConfig={siteConfig} bio={siteConfig.bio} />
      <WhatsAppButton />
    </>
  )
}
```

- [ ] **Step 27: Update `src/app/colecciones/page.tsx`**

```tsx
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'
import { CollectionsGrid } from '@/components/collections/CollectionsGrid'
import { getCollections, getSiteConfig } from '@/lib/data'

export default async function CollectionsPage() {
  const [collections, siteConfig] = await Promise.all([getCollections(), getSiteConfig()])

  return (
    <>
      <Navbar siteConfig={siteConfig} />
      <main className="pt-24">
        <CollectionsGrid collections={collections} />
      </main>
      <Footer siteConfig={siteConfig} bio={siteConfig.bio} />
      <WhatsAppButton />
    </>
  )
}
```

- [ ] **Step 28: Update `src/app/colecciones/[slug]/page.tsx`** — the slug-to-collection lookup moves here (per the design doc), and drops `generateStaticParams` (see decision above)

```tsx
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'
import { CollectionDetail } from '@/components/collections/CollectionDetail'
import { getCollectionBySlug, getArtworks, getSiteConfig } from '@/lib/data'

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [collection, siteConfig, allArtworks] = await Promise.all([
    getCollectionBySlug(slug),
    getSiteConfig(),
    getArtworks(),
  ])
  if (!collection) notFound()

  const works = collection.workIds
    .map((id) => allArtworks.find((a) => a.id === id))
    .filter((work): work is NonNullable<typeof work> => Boolean(work))

  return (
    <>
      <Navbar siteConfig={siteConfig} />
      <main className="pt-24">
        <CollectionDetail collection={collection} works={works} />
      </main>
      <Footer siteConfig={siteConfig} bio={siteConfig.bio} />
      <WhatsAppButton />
    </>
  )
}
```

- [ ] **Step 29: Run the full test suite and build**

Run: `npm run test:run && npm run build`
Expected: every test file passes; build succeeds. (The build will only work end-to-end once a real database is reachable — if `DATABASE_URL` isn't configured yet in this environment, `npm run build`'s static-generation attempt for `/`, `/colecciones` may fail; that's expected until Task 2/3's Supabase project is actually provisioned. `npm run test:run` must pass regardless, since all data-layer tests mock `prisma`/`storage`.)

- [ ] Commit this task's changes.

---

### Task 7: Image upload flow (pending uploads, signed URLs, claim-on-save, orphan cleanup)

**Files:**
- Modify: `src/lib/validation.ts`
- Create: `src/lib/actions/uploads.ts`
- Create: `src/lib/actions/claim-upload.ts`
- Test: `src/test/uploads.test.ts`
- Test: `src/test/claim-upload.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 4), `prisma` (Task 2), `createSignedUploadUrl`/`objectExists`/`moveObject`/`deleteObject` (Task 3).
- Produces: `createPendingUpload(fileName, mimeType, fileSize)` Server Action (consumed by the admin upload widgets in Task 8), `claimUpload(uploadId, destinationPath)` and `deleteImageIfPresent(path)` (consumed by every artwork/site Server Action that handles an image in Tasks 8-9).

Per the design doc's "Image upload flow": Server Actions have a 1MB default body limit (too small for photos), and new artworks don't have an `id` yet at upload time — so uploads are staged through a `PendingUpload` row at a stable `pending/{uploadId}.{ext}` path, uploaded directly to Storage via a signed URL (bypassing the Next.js server entirely), and only claimed (moved to a permanent path) once the surrounding create/update form actually saves.

- [ ] **Step 1: Extend `src/lib/validation.ts`** — add the upload-request schema (append below the existing `loginSchema`)

```typescript
export const uploadRequestSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, 'File must be 10MB or smaller'),
})
```

- [ ] **Step 2: Create `src/lib/actions/uploads.ts`**

```typescript
'use server'

import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSignedUploadUrl } from '@/lib/storage'
import { uploadRequestSchema } from '@/lib/validation'

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export interface PendingUploadResult {
  uploadId: string
  signedUrl: string
  path: string
}

/**
 * Issues an upload slot: validates the request, creates a PendingUpload row
 * at a stable pending/{id}.{ext} path, and returns a signed URL the browser
 * can PUT the file to directly (the file never passes through this server
 * function's own body).
 */
export async function createPendingUpload(
  fileName: string,
  mimeType: string,
  fileSize: number
): Promise<PendingUploadResult> {
  await requireAdmin()

  const parsed = uploadRequestSchema.safeParse({ fileName, mimeType, fileSize })
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid upload request')
  }

  const extension = EXTENSION_BY_MIME_TYPE[parsed.data.mimeType]

  // The path is derived from the row's own generated id, so it's created
  // with a placeholder path first, then updated once the id is known.
  const pending = await prisma.pendingUpload.create({
    data: { path: '', mimeType: parsed.data.mimeType },
  })
  const path = `pending/${pending.id}.${extension}`
  await prisma.pendingUpload.update({ where: { id: pending.id }, data: { path } })

  const { signedUrl } = await createSignedUploadUrl(path)
  return { uploadId: pending.id, signedUrl, path }
}
```

- [ ] **Step 3: Write `src/test/uploads.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireAdminMock = vi.fn(async () => undefined)
vi.mock('@/lib/auth', () => ({ requireAdmin: () => requireAdminMock() }))

const createMock = vi.fn()
const updateMock = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    pendingUpload: {
      create: (...args: unknown[]) => createMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}))

const createSignedUploadUrlMock = vi.fn()
vi.mock('@/lib/storage', () => ({
  createSignedUploadUrl: (...args: unknown[]) => createSignedUploadUrlMock(...args),
}))

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue(undefined)
  createMock.mockReset().mockResolvedValue({ id: 'upload-1' })
  updateMock.mockReset()
  createSignedUploadUrlMock.mockReset().mockResolvedValue({ signedUrl: 'https://signed.example/put', token: 'tok' })
})

describe('createPendingUpload', () => {
  it('calls requireAdmin before anything else', async () => {
    const { createPendingUpload } = await import('@/lib/actions/uploads')
    await createPendingUpload('photo.jpg', 'image/jpeg', 1024)
    expect(requireAdminMock).toHaveBeenCalled()
  })

  it('rejects a disallowed mime type', async () => {
    const { createPendingUpload } = await import('@/lib/actions/uploads')
    await expect(createPendingUpload('doc.pdf', 'application/pdf', 1024)).rejects.toThrow()
  })

  it('rejects a file larger than 10MB', async () => {
    const { createPendingUpload } = await import('@/lib/actions/uploads')
    await expect(createPendingUpload('big.jpg', 'image/jpeg', 11 * 1024 * 1024)).rejects.toThrow()
  })

  it('creates a PendingUpload row at a stable pending/{id}.{ext} path and returns its signed URL', async () => {
    const { createPendingUpload } = await import('@/lib/actions/uploads')
    const result = await createPendingUpload('photo.jpg', 'image/jpeg', 1024)
    expect(result).toEqual({
      uploadId: 'upload-1',
      signedUrl: 'https://signed.example/put',
      path: 'pending/upload-1.jpg',
    })
    expect(updateMock).toHaveBeenCalledWith({ where: { id: 'upload-1' }, data: { path: 'pending/upload-1.jpg' } })
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npm run test:run -- src/test/uploads.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create `src/lib/actions/claim-upload.ts`**

```typescript
import { prisma } from '@/lib/prisma'
import { objectExists, moveObject, deleteObject } from '@/lib/storage'

const MAX_PENDING_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Claims a previously-issued PendingUpload: verifies it exists, hasn't
 * already been claimed, and hasn't expired — then confirms the Storage
 * object actually exists at the recorded path (the claim is verified
 * server-side, never trusted from the client's uploadId alone) before
 * moving it to its permanent path and marking the row claimed.
 */
export async function claimUpload(uploadId: string, destinationPath: string): Promise<void> {
  const pending = await prisma.pendingUpload.findUnique({ where: { id: uploadId } })
  if (!pending) throw new Error('Upload not found')
  if (pending.claimedAt) throw new Error('Upload has already been used')
  if (Date.now() - pending.createdAt.getTime() > MAX_PENDING_UPLOAD_AGE_MS) {
    throw new Error('Upload has expired')
  }

  const exists = await objectExists(pending.path)
  if (!exists) throw new Error('Uploaded file was not found in storage')

  await moveObject(pending.path, destinationPath)
  await prisma.pendingUpload.update({ where: { id: uploadId }, data: { claimedAt: new Date() } })
}

/** Best-effort delete of a now-orphaned image (replaced image or deleted artwork). */
export async function deleteImageIfPresent(path: string | null | undefined): Promise<void> {
  if (!path) return
  await deleteObject(path)
}
```

- [ ] **Step 6: Write `src/test/claim-upload.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUniqueMock = vi.fn()
const updateMock = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    pendingUpload: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}))

const objectExistsMock = vi.fn()
const moveObjectMock = vi.fn()
const deleteObjectMock = vi.fn()
vi.mock('@/lib/storage', () => ({
  objectExists: (...args: unknown[]) => objectExistsMock(...args),
  moveObject: (...args: unknown[]) => moveObjectMock(...args),
  deleteObject: (...args: unknown[]) => deleteObjectMock(...args),
}))

beforeEach(() => {
  findUniqueMock.mockReset()
  updateMock.mockReset()
  objectExistsMock.mockReset().mockResolvedValue(true)
  moveObjectMock.mockReset()
  deleteObjectMock.mockReset()
})

describe('claimUpload', () => {
  it('rejects an unknown uploadId', async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await expect(claimUpload('nope', 'artworks/1/a.jpg')).rejects.toThrow('Upload not found')
  })

  it('rejects an already-claimed upload', async () => {
    findUniqueMock.mockResolvedValueOnce({ id: 'u1', path: 'pending/u1.jpg', createdAt: new Date(), claimedAt: new Date() })
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await expect(claimUpload('u1', 'artworks/1/a.jpg')).rejects.toThrow('already been used')
  })

  it('rejects an upload older than 24 hours', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'u1',
      path: 'pending/u1.jpg',
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      claimedAt: null,
    })
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await expect(claimUpload('u1', 'artworks/1/a.jpg')).rejects.toThrow('expired')
  })

  it('rejects when the storage object does not actually exist', async () => {
    findUniqueMock.mockResolvedValueOnce({ id: 'u1', path: 'pending/u1.jpg', createdAt: new Date(), claimedAt: null })
    objectExistsMock.mockResolvedValueOnce(false)
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await expect(claimUpload('u1', 'artworks/1/a.jpg')).rejects.toThrow('not found in storage')
  })

  it('moves the object to its permanent path and marks the row claimed on success', async () => {
    findUniqueMock.mockResolvedValueOnce({ id: 'u1', path: 'pending/u1.jpg', createdAt: new Date(), claimedAt: null })
    const { claimUpload } = await import('@/lib/actions/claim-upload')
    await claimUpload('u1', 'artworks/1/a.jpg')
    expect(moveObjectMock).toHaveBeenCalledWith('pending/u1.jpg', 'artworks/1/a.jpg')
    expect(updateMock).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { claimedAt: expect.any(Date) } })
  })
})

describe('deleteImageIfPresent', () => {
  it('does nothing for a null or undefined path', async () => {
    const { deleteImageIfPresent } = await import('@/lib/actions/claim-upload')
    await deleteImageIfPresent(null)
    await deleteImageIfPresent(undefined)
    expect(deleteObjectMock).not.toHaveBeenCalled()
  })

  it('deletes the object when a path is given', async () => {
    const { deleteImageIfPresent } = await import('@/lib/actions/claim-upload')
    await deleteImageIfPresent('artworks/1/a.jpg')
    expect(deleteObjectMock).toHaveBeenCalledWith('artworks/1/a.jpg')
  })
})
```

- [ ] **Step 7: Run the test**

Run: `npm run test:run -- src/test/claim-upload.test.ts`
Expected: PASS (7 tests).

- [ ] Commit this task's changes.

---

### Task 8: Admin UI — layout, dashboard, artworks, collections, site config, bio, logout

**Files:**
- Create: `src/app/admin/(protected)/layout.tsx`
- Create: `src/components/admin/LogoutButton.tsx`
- Create: `src/app/admin/(protected)/page.tsx`
- Modify: `src/lib/validation.ts`
- Create: `src/lib/actions/artworks.ts`
- Create: `src/components/admin/ArtworkForm.tsx`
- Create: `src/app/admin/(protected)/artworks/page.tsx`
- Create: `src/app/admin/(protected)/artworks/new/page.tsx`
- Create: `src/app/admin/(protected)/artworks/[id]/page.tsx`
- Create: `src/lib/actions/collections.ts`
- Create: `src/app/admin/(protected)/collections/page.tsx`
- Create: `src/app/admin/(protected)/collections/new/page.tsx`
- Create: `src/app/admin/(protected)/collections/[id]/page.tsx`
- Create: `src/lib/actions/site.ts`
- Create: `src/components/admin/SiteConfigForm.tsx`
- Create: `src/app/admin/(protected)/site/page.tsx`
- Test: `src/test/actions/artworks.test.ts`
- Test: `src/test/actions/collections.test.ts`
- Test: `src/test/actions/site.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 4), `prisma` (Task 2), `publicUrlFor` (Task 3), `createPendingUpload` (Task 7), `claimUpload`/`deleteImageIfPresent` (Task 7).
- Produces: every admin route under `/admin`, plus the mutating Server Actions (`createArtwork`, `updateArtwork`, `deleteArtwork`, `toggleArtworkPublished`, `moveArtwork`, `createCollection`, `updateCollection`, `deleteCollection`, `moveCollection`, `addArtworkToCollection`, `removeArtworkFromCollection`, `moveArtworkInCollection`, `updateSiteConfig`, `addBioParagraph`, `updateBioParagraph`, `removeBioParagraph`, `moveBioParagraph`) that Task 9 wires cache invalidation into.

**Decision — route-group split to avoid a login redirect loop:** the admin shell (nav + logout header) must wrap the dashboard and every `/admin/*` subroute, but must **not** wrap `/admin/login` — if it did, the shell's own admin-gate would redirect `/admin/login` to itself before it ever rendered. Next's route groups solve this without affecting URLs: everything except login lives under `src/app/admin/(protected)/...` (the `(protected)` segment adds no path segment — `src/app/admin/(protected)/page.tsx` is still served at `/admin`), while `src/app/admin/login/page.tsx` (Task 4) stays a sibling outside the group.

**Decision — deferred cache invalidation:** every mutating action below ends with a `// TODO(Task 9): ...` comment instead of an `updateTag`/`revalidatePath` call. This is deliberate, not an oversight: admin pages in this plan always read directly from `prisma` (see Global Constraints), so the admin UI itself is correct and fully usable the moment this task lands — an edit shows up on `/admin/artworks` on the very next request, with no caching involved. What's missing until Task 9 is the **public** cached pages (`/`, `/colecciones`, `/colecciones/[slug]`) picking up the change without waiting for their cache to expire on its own. Splitting it this way means Task 8 is independently testable and committable without a half-wired invalidation call site being subtly wrong.

**Decision — bound Server Actions instead of client-side row components:** every list-page row action (move up/down, publish toggle, delete) is a plain `<form>`/`<button formAction>` bound to a named, independently-testable Server Action via `.bind(null, id, ...)` — e.g. `moveArtwork.bind(null, artwork.id, 'up')`. This works with zero client-side JavaScript (progressive enhancement) and avoids turning every table row into its own Client Component. TypeScript allows this because a function that ignores trailing arguments (here, the `FormData` React automatically appends when a bound action is used as a form's `action`/`formAction`) is a valid implementation of a type that declares more parameters — no extra `_formData` placeholder parameter is needed on `moveArtwork`, `deleteArtwork`, etc.

- [ ] **Step 1: Extend `src/lib/validation.ts`** — add the artwork/collection/site-config/bio-paragraph form schemas (append below the existing `loginSchema`/`uploadRequestSchema`)

```typescript
export const artworkFormSchema = z.object({
  type: z.enum(['PAINTING', 'DRAWING']),
  titleEs: z.string().min(1),
  titleEn: z.string().min(1),
  techniqueEs: z.string().min(1),
  techniqueEn: z.string().min(1),
  size: z.string().min(1),
  year: z.string().min(1),
  price: z.string().min(1),
  status: z.enum(['AVAILABLE', 'SOLD']),
  isPublished: z.boolean(),
  uploadId: z.string().optional(),
})

export const collectionFormSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
  nameEs: z.string().min(1),
  nameEn: z.string().min(1),
})

export const siteConfigFormSchema = z.object({
  name: z.string().min(1),
  taglineEs: z.string().min(1),
  taglineEn: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  whatsapp: z.string().min(1),
  instagramPersonal: z.string().url(),
  instagramStudio: z.string().url(),
  bioRoleEs: z.string().min(1),
  bioRoleEn: z.string().min(1),
  bioLocation: z.string().min(1),
  bioSince: z.string().min(1),
  uploadId: z.string().optional(),
})

export const bioParagraphFormSchema = z.object({
  textEs: z.string().min(1),
  textEn: z.string().min(1),
})
```

- [ ] **Step 2: Create `src/app/admin/(protected)/layout.tsx`**

```tsx
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { LogoutButton } from '@/components/admin/LogoutButton'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-brand-black text-brand-text">
      <header className="border-b border-brand-border">
        <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between h-16">
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/admin" className="font-display text-lg">Admin</Link>
            <Link href="/admin/artworks" className="text-brand-text/80 hover:text-brand-text">Obras</Link>
            <Link href="/admin/collections" className="text-brand-text/80 hover:text-brand-text">Colecciones</Link>
            <Link href="/admin/site" className="text-brand-text/80 hover:text-brand-text">Sitio</Link>
          </nav>
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto px-6 py-10">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/admin/LogoutButton.tsx`**

```tsx
import { logoutAction } from '@/lib/actions/auth-actions'

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="text-sm text-brand-muted hover:text-brand-text transition-colors">
        Cerrar sesión
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Create `src/app/admin/(protected)/page.tsx`** (dashboard)

```tsx
import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function AdminDashboardPage() {
  const [total, available, sold] = await Promise.all([
    prisma.artwork.count(),
    prisma.artwork.count({ where: { status: 'AVAILABLE' } }),
    prisma.artwork.count({ where: { status: 'SOLD' } }),
  ])

  return (
    <div>
      <h1 className="font-display text-3xl mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <StatCard label="Total de obras" value={total} />
        <StatCard label="Disponibles" value={available} />
        <StatCard label="Vendidas" value={sold} />
      </div>
      <div className="flex gap-4 text-sm">
        <Link href="/admin/artworks/new" className="underline">+ Nueva obra</Link>
        <Link href="/admin/collections/new" className="underline">+ Nueva colección</Link>
        <Link href="/admin/site" className="underline">Editar sitio</Link>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-brand-border bg-brand-card p-6">
      <div className="text-3xl font-display">{value}</div>
      <div className="text-xs text-brand-muted uppercase tracking-widest mt-2">{label}</div>
    </div>
  )
}
```

- [ ] **Step 5: Create `src/lib/actions/artworks.ts`**

```typescript
'use server'

import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { artworkFormSchema } from '@/lib/validation'
import { claimUpload, deleteImageIfPresent } from '@/lib/actions/claim-upload'
import type { ArtworkType, ArtworkStatus } from '@prisma/client'

interface ParsedArtworkForm {
  type: ArtworkType
  titleEs: string
  titleEn: string
  techniqueEs: string
  techniqueEn: string
  size: string
  year: string
  price: string
  status: ArtworkStatus
  isPublished: boolean
  uploadId?: string
}

function parseArtworkForm(formData: FormData): ParsedArtworkForm {
  return artworkFormSchema.parse({
    type: formData.get('type'),
    titleEs: formData.get('titleEs'),
    titleEn: formData.get('titleEn'),
    techniqueEs: formData.get('techniqueEs'),
    techniqueEn: formData.get('techniqueEn'),
    size: formData.get('size'),
    year: formData.get('year'),
    price: formData.get('price'),
    status: formData.get('status'),
    isPublished: formData.get('isPublished') === 'on',
    uploadId: formData.get('uploadId') || undefined,
  }) as ParsedArtworkForm
}

export async function createArtwork(formData: FormData): Promise<void> {
  await requireAdmin()
  const data = parseArtworkForm(formData)
  if (!data.uploadId) throw new Error('An image is required for a new artwork')

  const last = await prisma.artwork.findFirst({ orderBy: { displayOrder: 'desc' } })
  const displayOrder = (last?.displayOrder ?? -1) + 1

  const artwork = await prisma.artwork.create({
    data: {
      type: data.type,
      titleEs: data.titleEs,
      titleEn: data.titleEn,
      techniqueEs: data.techniqueEs,
      techniqueEn: data.techniqueEn,
      size: data.size,
      year: data.year,
      price: data.price,
      status: data.status,
      isPublished: data.isPublished,
      displayOrder,
      imagePath: '', // set below once the permanent path is known
    },
  })

  const pending = await prisma.pendingUpload.findUniqueOrThrow({ where: { id: data.uploadId } })
  const extension = pending.path.split('.').pop()
  const permanentPath = `artworks/${artwork.id}/${data.uploadId}.${extension}`
  await claimUpload(data.uploadId, permanentPath)
  await prisma.artwork.update({ where: { id: artwork.id }, data: { imagePath: permanentPath } })

  // TODO(Task 9): invalidate the 'artworks' cache tag and revalidatePath('/')
  // — this artwork won't appear on the public site until that lands.
}

export async function updateArtwork(id: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const data = parseArtworkForm(formData)
  const existing = await prisma.artwork.findUniqueOrThrow({ where: { id } })

  let imagePath = existing.imagePath
  if (data.uploadId) {
    const pending = await prisma.pendingUpload.findUniqueOrThrow({ where: { id: data.uploadId } })
    const extension = pending.path.split('.').pop()
    const permanentPath = `artworks/${id}/${data.uploadId}.${extension}`
    await claimUpload(data.uploadId, permanentPath)
    imagePath = permanentPath
  }

  await prisma.artwork.update({
    where: { id },
    data: {
      type: data.type,
      titleEs: data.titleEs,
      titleEn: data.titleEn,
      techniqueEs: data.techniqueEs,
      techniqueEn: data.techniqueEn,
      size: data.size,
      year: data.year,
      price: data.price,
      status: data.status,
      isPublished: data.isPublished,
      imagePath,
    },
  })

  // Orphan cleanup: only delete the old image once the new one is claimed
  // and the row is updated, and only if an image was actually replaced.
  if (data.uploadId && existing.imagePath) {
    await deleteImageIfPresent(existing.imagePath)
  }

  // TODO(Task 9): invalidate 'artworks' + any collections this artwork belongs to.
}

export async function deleteArtwork(id: string): Promise<void> {
  await requireAdmin()
  // Membership must be read BEFORE delete() — CollectionArtwork rows cascade
  // away with the artwork, so Task 9's invalidation needs this captured now.
  const existing = await prisma.artwork.findUniqueOrThrow({
    where: { id },
    include: { collections: { include: { collection: true } } },
  })
  await prisma.artwork.delete({ where: { id } }) // cascades CollectionArtwork; SetNull on any Collection.coverArtworkId
  await deleteImageIfPresent(existing.imagePath)

  // TODO(Task 9): invalidate 'artworks' + each existing.collections[].collection.slug,
  // using the pre-delete `existing.collections` captured above.
}

export async function toggleArtworkPublished(id: string, isPublished: boolean): Promise<void> {
  await requireAdmin()
  await prisma.artwork.update({ where: { id }, data: { isPublished } })

  // TODO(Task 9): invalidate 'artworks' + any collections this artwork belongs to.
}

export async function moveArtwork(id: string, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  const current = await prisma.artwork.findUniqueOrThrow({ where: { id } })
  const neighbor = await prisma.artwork.findFirst({
    where:
      direction === 'up'
        ? { displayOrder: { lt: current.displayOrder } }
        : { displayOrder: { gt: current.displayOrder } },
    orderBy: { displayOrder: direction === 'up' ? 'desc' : 'asc' },
  })
  if (!neighbor) return // already at the boundary

  await prisma.$transaction([
    prisma.artwork.update({ where: { id: current.id }, data: { displayOrder: neighbor.displayOrder } }),
    prisma.artwork.update({ where: { id: neighbor.id }, data: { displayOrder: current.displayOrder } }),
  ])

  // TODO(Task 9): invalidate 'artworks'.
}
```

- [ ] **Step 6: Write `src/test/actions/artworks.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn(async () => undefined) }))

const artworkFindFirst = vi.fn()
const artworkFindUniqueOrThrow = vi.fn()
const artworkCreate = vi.fn()
const artworkUpdate = vi.fn()
const artworkDelete = vi.fn()
const transactionMock = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))
const pendingUploadFindUniqueOrThrow = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artwork: {
      findFirst: (...a: unknown[]) => artworkFindFirst(...a),
      findUniqueOrThrow: (...a: unknown[]) => artworkFindUniqueOrThrow(...a),
      create: (...a: unknown[]) => artworkCreate(...a),
      update: (...a: unknown[]) => artworkUpdate(...a),
      delete: (...a: unknown[]) => artworkDelete(...a),
    },
    pendingUpload: { findUniqueOrThrow: (...a: unknown[]) => pendingUploadFindUniqueOrThrow(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...(a as [Promise<unknown>[]])),
  },
}))

const claimUploadMock = vi.fn()
const deleteImageIfPresentMock = vi.fn()
vi.mock('@/lib/actions/claim-upload', () => ({
  claimUpload: (...a: unknown[]) => claimUploadMock(...a),
  deleteImageIfPresent: (...a: unknown[]) => deleteImageIfPresentMock(...a),
}))

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

const baseFields = {
  type: 'PAINTING',
  titleEs: 'Anhelo',
  titleEn: 'Longing',
  techniqueEs: 'Óleo',
  techniqueEn: 'Oil',
  size: '80x60',
  year: '2026',
  price: '$600',
  status: 'AVAILABLE',
}

beforeEach(() => {
  artworkFindFirst.mockReset().mockResolvedValue({ displayOrder: 4 })
  artworkFindUniqueOrThrow.mockReset()
  artworkCreate.mockReset().mockResolvedValue({ id: 'new-art' })
  artworkUpdate.mockReset()
  artworkDelete.mockReset()
  transactionMock.mockClear()
  pendingUploadFindUniqueOrThrow.mockReset().mockResolvedValue({ path: 'pending/upload-1.jpg' })
  claimUploadMock.mockReset()
  deleteImageIfPresentMock.mockReset()
})

describe('createArtwork', () => {
  it('rejects a new artwork with no uploadId', async () => {
    const { createArtwork } = await import('@/lib/actions/artworks')
    await expect(createArtwork(formDataFor(baseFields))).rejects.toThrow('An image is required')
  })

  it('assigns displayOrder as one past the current max', async () => {
    const { createArtwork } = await import('@/lib/actions/artworks')
    await createArtwork(formDataFor({ ...baseFields, uploadId: 'upload-1' }))
    expect(artworkCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayOrder: 5 }) })
    )
  })

  it('claims the pending upload at artworks/{id}/{uploadId}.{ext} and stores that path', async () => {
    const { createArtwork } = await import('@/lib/actions/artworks')
    await createArtwork(formDataFor({ ...baseFields, uploadId: 'upload-1' }))
    expect(claimUploadMock).toHaveBeenCalledWith('upload-1', 'artworks/new-art/upload-1.jpg')
    expect(artworkUpdate).toHaveBeenCalledWith({
      where: { id: 'new-art' },
      data: { imagePath: 'artworks/new-art/upload-1.jpg' },
    })
  })
})

describe('updateArtwork', () => {
  it('keeps the existing imagePath when no new upload is provided', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({ imagePath: 'artworks/a1/old.jpg' })
    const { updateArtwork } = await import('@/lib/actions/artworks')
    await updateArtwork('a1', formDataFor(baseFields))
    expect(artworkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ imagePath: 'artworks/a1/old.jpg' }) })
    )
    expect(deleteImageIfPresentMock).not.toHaveBeenCalled()
  })

  it('claims a new upload and deletes the old image when one is replaced', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({ imagePath: 'artworks/a1/old.jpg' })
    const { updateArtwork } = await import('@/lib/actions/artworks')
    await updateArtwork('a1', formDataFor({ ...baseFields, uploadId: 'upload-2' }))
    expect(claimUploadMock).toHaveBeenCalledWith('upload-2', 'artworks/a1/upload-2.jpg')
    expect(deleteImageIfPresentMock).toHaveBeenCalledWith('artworks/a1/old.jpg')
  })
})

describe('deleteArtwork', () => {
  it('captures collection memberships before deleting, then deletes the image', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({
      imagePath: 'artworks/a1/x.jpg',
      collections: [{ collection: { slug: 'estudios' } }],
    })
    const { deleteArtwork } = await import('@/lib/actions/artworks')
    await deleteArtwork('a1')
    expect(artworkDelete).toHaveBeenCalledWith({ where: { id: 'a1' } })
    expect(deleteImageIfPresentMock).toHaveBeenCalledWith('artworks/a1/x.jpg')
  })
})

describe('moveArtwork', () => {
  it('does nothing when already at the top boundary', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({ id: 'a1', displayOrder: 0 })
    artworkFindFirst.mockResolvedValueOnce(null)
    const { moveArtwork } = await import('@/lib/actions/artworks')
    await moveArtwork('a1', 'up')
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('swaps displayOrder with the neighbor inside a transaction', async () => {
    artworkFindUniqueOrThrow.mockResolvedValueOnce({ id: 'a1', displayOrder: 2 })
    artworkFindFirst.mockResolvedValueOnce({ id: 'a0', displayOrder: 1 })
    const { moveArtwork } = await import('@/lib/actions/artworks')
    await moveArtwork('a1', 'up')
    expect(transactionMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: Run the test**

Run: `npm run test:run -- src/test/actions/artworks.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Create `src/components/admin/ArtworkForm.tsx`** (Client Component — file input + signed-URL upload flow)

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPendingUpload } from '@/lib/actions/uploads'
import { createArtwork, updateArtwork } from '@/lib/actions/artworks'
import type { ArtworkType, ArtworkStatus } from '@prisma/client'

interface ArtworkFormValues {
  id?: string
  type: ArtworkType
  titleEs: string
  titleEn: string
  techniqueEs: string
  techniqueEn: string
  size: string
  year: string
  price: string
  status: ArtworkStatus
  isPublished: boolean
  imageUrl: string
}

export function ArtworkForm({ initial }: { initial?: ArtworkFormValues }) {
  const router = useRouter()
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.imageUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { uploadId: id, signedUrl } = await createPendingUpload(file.name, file.type, file.size)
      const res = await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!res.ok) throw new Error('Upload failed')
      setUploadId(id)
      setPreviewUrl(URL.createObjectURL(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true)
    setError(null)
    if (uploadId) formData.set('uploadId', uploadId)
    try {
      if (initial?.id) {
        await updateArtwork(initial.id, formData)
      } else {
        await createArtwork(formData)
      }
      router.push('/admin/artworks')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
      setSubmitting(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-xl">
      {error && <p className="text-brand-accentLight text-sm">{error}</p>}

      <div>
        <label className="block text-sm mb-2">Imagen</label>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="w-40 aspect-[4/5] object-cover mb-2 border border-brand-border" />
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
        {uploading && <p className="text-xs text-brand-muted mt-1">Subiendo…</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Tipo
          <select name="type" defaultValue={initial?.type ?? 'PAINTING'} className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1">
            <option value="PAINTING">Pintura</option>
            <option value="DRAWING">Dibujo</option>
          </select>
        </label>
        <label className="text-sm">Estado
          <select name="status" defaultValue={initial?.status ?? 'AVAILABLE'} className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1">
            <option value="AVAILABLE">Disponible</option>
            <option value="SOLD">Vendida</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Título (ES)
          <input name="titleEs" defaultValue={initial?.titleEs} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Título (EN)
          <input name="titleEn" defaultValue={initial?.titleEn} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Técnica (ES)
          <input name="techniqueEs" defaultValue={initial?.techniqueEs} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Técnica (EN)
          <input name="techniqueEn" defaultValue={initial?.techniqueEn} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="text-sm">Tamaño
          <input name="size" defaultValue={initial?.size} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Año
          <input name="year" defaultValue={initial?.year} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Precio
          <input name="price" defaultValue={initial?.price} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" defaultChecked={initial?.isPublished ?? true} />
        Publicada
      </label>

      <button type="submit" disabled={submitting || uploading} className="px-6 py-3 bg-brand-accent text-sm">
        {submitting ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 9: Create `src/app/admin/(protected)/artworks/page.tsx`** (list, search/filter, reorder, publish toggle, delete)

```tsx
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { moveArtwork, toggleArtworkPublished, deleteArtwork } from '@/lib/actions/artworks'

export default async function AdminArtworksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>
}) {
  const { q, type, status } = await searchParams

  const artworks = await prisma.artwork.findMany({
    where: {
      ...(type === 'painting' || type === 'drawing' ? { type: type.toUpperCase() as 'PAINTING' | 'DRAWING' } : {}),
      ...(status === 'available' || status === 'sold' ? { status: status.toUpperCase() as 'AVAILABLE' | 'SOLD' } : {}),
      ...(q
        ? { OR: [{ titleEs: { contains: q, mode: 'insensitive' as const } }, { titleEn: { contains: q, mode: 'insensitive' as const } }] }
        : {}),
    },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl">Obras ({artworks.length})</h1>
        <Link href="/admin/artworks/new" className="px-4 py-2 bg-brand-accent text-sm">+ Nueva obra</Link>
      </div>

      <form className="flex flex-wrap gap-3 mb-6 text-sm" method="get">
        <input type="text" name="q" defaultValue={q ?? ''} placeholder="Buscar por título…" className="bg-brand-card border border-brand-border px-3 py-2" />
        <select name="type" defaultValue={type ?? ''} className="bg-brand-card border border-brand-border px-3 py-2">
          <option value="">Todos los tipos</option>
          <option value="painting">Pinturas</option>
          <option value="drawing">Dibujos</option>
        </select>
        <select name="status" defaultValue={status ?? ''} className="bg-brand-card border border-brand-border px-3 py-2">
          <option value="">Todos los estados</option>
          <option value="available">Disponibles</option>
          <option value="sold">Vendidas</option>
        </select>
        <button type="submit" className="px-4 py-2 border border-brand-border">Filtrar</button>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-brand-muted border-b border-brand-border">
            <th className="py-2">Orden</th>
            <th>Título</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Publicada</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {artworks.map((artwork, index) => (
            <tr key={artwork.id} className="border-b border-brand-border/50">
              <td className="py-2">
                <form className="flex gap-1">
                  <button formAction={moveArtwork.bind(null, artwork.id, 'up')} disabled={index === 0} aria-label="Mover arriba">↑</button>
                  <button formAction={moveArtwork.bind(null, artwork.id, 'down')} disabled={index === artworks.length - 1} aria-label="Mover abajo">↓</button>
                </form>
              </td>
              <td>{artwork.titleEs}</td>
              <td>{artwork.type === 'PAINTING' ? 'Pintura' : 'Dibujo'}</td>
              <td>{artwork.status === 'AVAILABLE' ? 'Disponible' : 'Vendida'}</td>
              <td>
                <form>
                  <button formAction={toggleArtworkPublished.bind(null, artwork.id, !artwork.isPublished)}>
                    {artwork.isPublished ? 'Sí' : 'No'}
                  </button>
                </form>
              </td>
              <td className="text-right">
                <Link href={`/admin/artworks/${artwork.id}`} className="underline mr-3">Editar</Link>
                <form className="inline" action={deleteArtwork.bind(null, artwork.id)}>
                  <button type="submit" className="text-brand-accentLight">Eliminar</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 10: Create `src/app/admin/(protected)/artworks/new/page.tsx`**

```tsx
import { ArtworkForm } from '@/components/admin/ArtworkForm'

export default function NewArtworkPage() {
  return (
    <div>
      <h1 className="font-display text-3xl mb-8">Nueva obra</h1>
      <ArtworkForm />
    </div>
  )
}
```

- [ ] **Step 11: Create `src/app/admin/(protected)/artworks/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { publicUrlFor } from '@/lib/storage'
import { ArtworkForm } from '@/components/admin/ArtworkForm'

export default async function EditArtworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const artwork = await prisma.artwork.findUnique({ where: { id } })
  if (!artwork) notFound()

  return (
    <div>
      <h1 className="font-display text-3xl mb-8">Editar obra</h1>
      <ArtworkForm
        initial={{
          id: artwork.id,
          type: artwork.type,
          titleEs: artwork.titleEs,
          titleEn: artwork.titleEn,
          techniqueEs: artwork.techniqueEs,
          techniqueEn: artwork.techniqueEn,
          size: artwork.size,
          year: artwork.year,
          price: artwork.price,
          status: artwork.status,
          isPublished: artwork.isPublished,
          imageUrl: publicUrlFor(artwork.imagePath),
        }}
      />
    </div>
  )
}
```

- [ ] **Step 12: Run the full build to confirm the artworks admin routes compile**

Run: `npm run build`
Expected: succeeds, listing `/admin`, `/admin/artworks`, `/admin/artworks/new`, `/admin/artworks/[id]` as routes (may still fail at the static-generation step without a reachable database — that's expected pre-Task-2/3-provisioning; the important thing is no TypeScript/route-structure error).

- [ ] **Step 13: Create `src/lib/actions/collections.ts`**

```typescript
'use server'

import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { collectionFormSchema } from '@/lib/validation'

function parseCollectionForm(formData: FormData) {
  return collectionFormSchema.parse({
    slug: formData.get('slug'),
    nameEs: formData.get('nameEs'),
    nameEn: formData.get('nameEn'),
  })
}

export async function createCollection(formData: FormData): Promise<void> {
  await requireAdmin()
  const data = parseCollectionForm(formData)

  const last = await prisma.collection.findFirst({ orderBy: { displayOrder: 'desc' } })
  await prisma.collection.create({
    data: { slug: data.slug, nameEs: data.nameEs, nameEn: data.nameEn, displayOrder: (last?.displayOrder ?? -1) + 1 },
  })

  // TODO(Task 9): invalidate 'collections' and `collection:${data.slug}`.
}

export async function updateCollection(id: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const data = parseCollectionForm(formData)
  const coverArtworkId = (formData.get('coverArtworkId') as string) || null

  const existing = await prisma.collection.findUniqueOrThrow({ where: { id } })

  if (coverArtworkId) {
    // Business rules the schema itself can't enforce: the cover must be a
    // member of THIS collection, and must be a published artwork (an
    // unpublished cover would render a broken image on the public page).
    const membership = await prisma.collectionArtwork.findUnique({
      where: { collectionId_artworkId: { collectionId: id, artworkId: coverArtworkId } },
      include: { artwork: true },
    })
    if (!membership) throw new Error('Cover must be an artwork already assigned to this collection')
    if (!membership.artwork.isPublished) throw new Error('Cover must be a published artwork')
  }

  await prisma.collection.update({
    where: { id },
    data: { slug: data.slug, nameEs: data.nameEs, nameEn: data.nameEn, coverArtworkId },
  })

  // TODO(Task 9): if data.slug !== existing.slug, invalidate BOTH
  // `collection:${existing.slug}` and `collection:${data.slug}` (plus their
  // revalidatePath calls) so the old URL stops serving stale content before
  // it 404s; always invalidate 'collections' either way.
  void existing
}

export async function deleteCollection(id: string): Promise<void> {
  await requireAdmin()
  const existing = await prisma.collection.findUniqueOrThrow({ where: { id } })
  await prisma.collection.delete({ where: { id } }) // cascades CollectionArtwork rows

  // TODO(Task 9): invalidate `collection:${existing.slug}`, 'collections',
  // and revalidatePath('/colecciones') so the grid drops this collection.
  void existing
}

export async function moveCollection(id: string, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  const current = await prisma.collection.findUniqueOrThrow({ where: { id } })
  const neighbor = await prisma.collection.findFirst({
    where:
      direction === 'up'
        ? { displayOrder: { lt: current.displayOrder } }
        : { displayOrder: { gt: current.displayOrder } },
    orderBy: { displayOrder: direction === 'up' ? 'desc' : 'asc' },
  })
  if (!neighbor) return

  await prisma.$transaction([
    prisma.collection.update({ where: { id: current.id }, data: { displayOrder: neighbor.displayOrder } }),
    prisma.collection.update({ where: { id: neighbor.id }, data: { displayOrder: current.displayOrder } }),
  ])

  // TODO(Task 9): invalidate 'collections'.
}

export async function addArtworkToCollection(collectionId: string, artworkId: string): Promise<void> {
  await requireAdmin()
  const last = await prisma.collectionArtwork.findFirst({
    where: { collectionId },
    orderBy: { position: 'desc' },
  })
  await prisma.collectionArtwork.create({
    data: { collectionId, artworkId, position: (last?.position ?? -1) + 1 },
  })

  // TODO(Task 9): invalidate this collection's tags/paths.
}

export async function removeArtworkFromCollection(collectionId: string, artworkId: string): Promise<void> {
  await requireAdmin()
  const collection = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } })
  await prisma.collectionArtwork.delete({
    where: { collectionId_artworkId: { collectionId, artworkId } },
  })

  // An artwork that's removed from a collection can no longer validly be its cover.
  if (collection.coverArtworkId === artworkId) {
    await prisma.collection.update({ where: { id: collectionId }, data: { coverArtworkId: null } })
  }

  // TODO(Task 9): invalidate this collection's tags/paths.
}

export async function moveArtworkInCollection(
  collectionId: string,
  artworkId: string,
  direction: 'up' | 'down'
): Promise<void> {
  await requireAdmin()
  const current = await prisma.collectionArtwork.findUniqueOrThrow({
    where: { collectionId_artworkId: { collectionId, artworkId } },
  })
  const neighbor = await prisma.collectionArtwork.findFirst({
    where: {
      collectionId,
      position: direction === 'up' ? { lt: current.position } : { gt: current.position },
    },
    orderBy: { position: direction === 'up' ? 'desc' : 'asc' },
  })
  if (!neighbor) return

  await prisma.$transaction([
    prisma.collectionArtwork.update({
      where: { collectionId_artworkId: { collectionId, artworkId: current.artworkId } },
      data: { position: neighbor.position },
    }),
    prisma.collectionArtwork.update({
      where: { collectionId_artworkId: { collectionId, artworkId: neighbor.artworkId } },
      data: { position: current.position },
    }),
  ])

  // TODO(Task 9): invalidate this collection's tags/paths.
}
```

- [ ] **Step 14: Write `src/test/actions/collections.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn(async () => undefined) }))

const collectionFindFirst = vi.fn()
const collectionFindUniqueOrThrow = vi.fn()
const collectionCreate = vi.fn()
const collectionUpdate = vi.fn()
const collectionDelete = vi.fn()
const collectionArtworkFindUnique = vi.fn()
const collectionArtworkFindFirst = vi.fn()
const collectionArtworkCreate = vi.fn()
const collectionArtworkDelete = vi.fn()
const transactionMock = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    collection: {
      findFirst: (...a: unknown[]) => collectionFindFirst(...a),
      findUniqueOrThrow: (...a: unknown[]) => collectionFindUniqueOrThrow(...a),
      create: (...a: unknown[]) => collectionCreate(...a),
      update: (...a: unknown[]) => collectionUpdate(...a),
      delete: (...a: unknown[]) => collectionDelete(...a),
    },
    collectionArtwork: {
      findUnique: (...a: unknown[]) => collectionArtworkFindUnique(...a),
      findFirst: (...a: unknown[]) => collectionArtworkFindFirst(...a),
      create: (...a: unknown[]) => collectionArtworkCreate(...a),
      delete: (...a: unknown[]) => collectionArtworkDelete(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...(a as [Promise<unknown>[]])),
  },
}))

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

beforeEach(() => {
  collectionFindFirst.mockReset().mockResolvedValue({ displayOrder: 3 })
  collectionFindUniqueOrThrow.mockReset()
  collectionCreate.mockReset()
  collectionUpdate.mockReset()
  collectionDelete.mockReset()
  collectionArtworkFindUnique.mockReset()
  collectionArtworkFindFirst.mockReset()
  collectionArtworkCreate.mockReset()
  collectionArtworkDelete.mockReset()
  transactionMock.mockClear()
})

describe('updateCollection cover validation', () => {
  it('rejects a cover artwork that is not a member of the collection', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ slug: 'estudios' })
    collectionArtworkFindUnique.mockResolvedValueOnce(null)
    const { updateCollection } = await import('@/lib/actions/collections')
    const fd = formDataFor({ slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies' })
    fd.set('coverArtworkId', 'outside-artwork')
    await expect(updateCollection('col-1', fd)).rejects.toThrow('already assigned to this collection')
  })

  it('rejects an unpublished artwork as cover', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ slug: 'estudios' })
    collectionArtworkFindUnique.mockResolvedValueOnce({ artwork: { isPublished: false } })
    const { updateCollection } = await import('@/lib/actions/collections')
    const fd = formDataFor({ slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies' })
    fd.set('coverArtworkId', 'unpublished-artwork')
    await expect(updateCollection('col-1', fd)).rejects.toThrow('published artwork')
  })

  it('accepts a published, member artwork as cover', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ slug: 'estudios' })
    collectionArtworkFindUnique.mockResolvedValueOnce({ artwork: { isPublished: true } })
    const { updateCollection } = await import('@/lib/actions/collections')
    const fd = formDataFor({ slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies' })
    fd.set('coverArtworkId', 'good-artwork')
    await updateCollection('col-1', fd)
    expect(collectionUpdate).toHaveBeenCalledWith({
      where: { id: 'col-1' },
      data: { slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies', coverArtworkId: 'good-artwork' },
    })
  })
})

describe('removeArtworkFromCollection', () => {
  it('clears coverArtworkId when the removed artwork was the cover', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ id: 'col-1', coverArtworkId: 'art-1' })
    const { removeArtworkFromCollection } = await import('@/lib/actions/collections')
    await removeArtworkFromCollection('col-1', 'art-1')
    expect(collectionUpdate).toHaveBeenCalledWith({ where: { id: 'col-1' }, data: { coverArtworkId: null } })
  })

  it('leaves coverArtworkId untouched when a different artwork is removed', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ id: 'col-1', coverArtworkId: 'art-1' })
    const { removeArtworkFromCollection } = await import('@/lib/actions/collections')
    await removeArtworkFromCollection('col-1', 'art-2')
    expect(collectionUpdate).not.toHaveBeenCalled()
  })
})

describe('moveCollection', () => {
  it('does nothing at the boundary', async () => {
    collectionFindUniqueOrThrow.mockResolvedValueOnce({ id: 'col-1', displayOrder: 0 })
    collectionFindFirst.mockResolvedValueOnce(null)
    const { moveCollection } = await import('@/lib/actions/collections')
    await moveCollection('col-1', 'up')
    expect(transactionMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 15: Run the test**

Run: `npm run test:run -- src/test/actions/collections.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 16: Create `src/app/admin/(protected)/collections/page.tsx`**

```tsx
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { moveCollection, deleteCollection } from '@/lib/actions/collections'

export default async function AdminCollectionsPage() {
  const collections = await prisma.collection.findMany({
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { artworks: true } } },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl">Colecciones ({collections.length})</h1>
        <Link href="/admin/collections/new" className="px-4 py-2 bg-brand-accent text-sm">+ Nueva colección</Link>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-brand-muted border-b border-brand-border">
            <th className="py-2">Orden</th>
            <th>Nombre</th>
            <th>Slug</th>
            <th>Obras</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {collections.map((collection, index) => (
            <tr key={collection.id} className="border-b border-brand-border/50">
              <td className="py-2">
                <form className="flex gap-1">
                  <button formAction={moveCollection.bind(null, collection.id, 'up')} disabled={index === 0} aria-label="Mover arriba">↑</button>
                  <button formAction={moveCollection.bind(null, collection.id, 'down')} disabled={index === collections.length - 1} aria-label="Mover abajo">↓</button>
                </form>
              </td>
              <td>{collection.nameEs}</td>
              <td>{collection.slug}</td>
              <td>{collection._count.artworks}</td>
              <td className="text-right">
                <Link href={`/admin/collections/${collection.id}`} className="underline mr-3">Editar</Link>
                <form className="inline" action={deleteCollection.bind(null, collection.id)}>
                  <button type="submit" className="text-brand-accentLight">Eliminar</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 17: Create `src/app/admin/(protected)/collections/new/page.tsx`**

```tsx
import { createCollection } from '@/lib/actions/collections'

export default function NewCollectionPage() {
  return (
    <div>
      <h1 className="font-display text-3xl mb-8">Nueva colección</h1>
      <form action={createCollection} className="space-y-6 max-w-md">
        <label className="block text-sm">Slug
          <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="figura-humana" className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="block text-sm">Nombre (ES)
          <input name="nameEs" required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="block text-sm">Nombre (EN)
          <input name="nameEn" required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <button type="submit" className="px-6 py-3 bg-brand-accent text-sm">Crear</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 18: Create `src/app/admin/(protected)/collections/[id]/page.tsx`** — name/slug/cover edit form + artwork assignment list with move/remove + an "add artwork" form

```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import {
  updateCollection,
  moveArtworkInCollection,
  addArtworkToCollection,
  removeArtworkFromCollection,
} from '@/lib/actions/collections'

export default async function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: { artworks: { include: { artwork: true }, orderBy: { position: 'asc' } } },
  })
  if (!collection) notFound()

  const availableArtworks = await prisma.artwork.findMany({
    where: { isPublished: true, NOT: { id: { in: collection.artworks.map((a) => a.artworkId) } } },
    orderBy: { titleEs: 'asc' },
  })

  // Only published members are eligible covers — see updateCollection's
  // business-rule validation in src/lib/actions/collections.ts.
  const publishedMembers = collection.artworks.filter((a) => a.artwork.isPublished)

  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-display text-3xl mb-8">Editar colección</h1>
        <form action={updateCollection.bind(null, id)} className="space-y-6 max-w-md">
          <label className="block text-sm">Slug
            <input name="slug" defaultValue={collection.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
          </label>
          <label className="block text-sm">Nombre (ES)
            <input name="nameEs" defaultValue={collection.nameEs} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
          </label>
          <label className="block text-sm">Nombre (EN)
            <input name="nameEn" defaultValue={collection.nameEn} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
          </label>
          <label className="block text-sm">Portada
            <select name="coverArtworkId" defaultValue={collection.coverArtworkId ?? ''} className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1">
              <option value="">Sin portada</option>
              {publishedMembers.map((m) => (
                <option key={m.artworkId} value={m.artworkId}>{m.artwork.titleEs}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="px-6 py-3 bg-brand-accent text-sm">Guardar</button>
        </form>
      </div>

      <div>
        <h2 className="font-display text-2xl mb-4">Obras en esta colección</h2>
        <table className="w-full text-sm border-collapse mb-6">
          <tbody>
            {collection.artworks.map((membership, index) => (
              <tr key={membership.artworkId} className="border-b border-brand-border/50">
                <td className="py-2 pr-4">
                  <form className="flex gap-1">
                    <button formAction={moveArtworkInCollection.bind(null, id, membership.artworkId, 'up')} disabled={index === 0} aria-label="Mover arriba">↑</button>
                    <button formAction={moveArtworkInCollection.bind(null, id, membership.artworkId, 'down')} disabled={index === collection.artworks.length - 1} aria-label="Mover abajo">↓</button>
                  </form>
                </td>
                <td className="py-2">{membership.artwork.titleEs}</td>
                <td className="text-right">
                  <form action={removeArtworkFromCollection.bind(null, id, membership.artworkId)}>
                    <button type="submit" className="text-brand-accentLight">Quitar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="text-sm text-brand-muted mb-2">Añadir obra</h3>
        <form
          action={async (formData: FormData) => {
            'use server'
            const artworkId = formData.get('artworkId') as string
            await addArtworkToCollection(id, artworkId)
          }}
          className="flex gap-2"
        >
          <select name="artworkId" required className="bg-brand-card border border-brand-border px-3 py-2 text-sm">
            {availableArtworks.map((a) => (
              <option key={a.id} value={a.id}>{a.titleEs}</option>
            ))}
          </select>
          <button type="submit" className="px-4 py-2 border border-brand-border text-sm">Añadir</button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 19: Run the full build to confirm the collections admin routes compile**

Run: `npm run build`
Expected: succeeds structurally (same caveat as Step 12 regarding a live database).

- [ ] **Step 20: Create `src/lib/actions/site.ts`**

```typescript
'use server'

import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { siteConfigFormSchema, bioParagraphFormSchema } from '@/lib/validation'
import { claimUpload, deleteImageIfPresent } from '@/lib/actions/claim-upload'

export async function updateSiteConfig(formData: FormData): Promise<void> {
  await requireAdmin()
  const { uploadId, ...fields } = siteConfigFormSchema.parse({
    name: formData.get('name'),
    taglineEs: formData.get('taglineEs'),
    taglineEn: formData.get('taglineEn'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    whatsapp: formData.get('whatsapp'),
    instagramPersonal: formData.get('instagramPersonal'),
    instagramStudio: formData.get('instagramStudio'),
    bioRoleEs: formData.get('bioRoleEs'),
    bioRoleEn: formData.get('bioRoleEn'),
    bioLocation: formData.get('bioLocation'),
    bioSince: formData.get('bioSince'),
    uploadId: formData.get('uploadId') || undefined,
  })

  // SiteConfig is an application-level singleton: every read/write uses
  // id = 1 by convention (enforced here, not by a DB constraint — see
  // design doc). A second row would simply be inert as long as nothing else
  // ever queries/writes a different id.
  const existing = await prisma.siteConfig.findUnique({ where: { id: 1 } })

  let bioPhotoPath = existing?.bioPhotoPath ?? ''
  if (uploadId) {
    const pending = await prisma.pendingUpload.findUniqueOrThrow({ where: { id: uploadId } })
    const extension = pending.path.split('.').pop()
    const permanentPath = `site/bio-photo.${extension}`
    await claimUpload(uploadId, permanentPath)
    if (existing?.bioPhotoPath && existing.bioPhotoPath !== permanentPath) {
      await deleteImageIfPresent(existing.bioPhotoPath)
    }
    bioPhotoPath = permanentPath
  }

  await prisma.siteConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...fields, bioPhotoPath },
    update: { ...fields, bioPhotoPath },
  })

  // TODO(Task 9): invalidate 'site-config' and revalidatePath('/').
}

export async function addBioParagraph(formData: FormData): Promise<void> {
  await requireAdmin()
  const data = bioParagraphFormSchema.parse({ textEs: formData.get('textEs'), textEn: formData.get('textEn') })
  const last = await prisma.bioParagraph.findFirst({ orderBy: { order: 'desc' } })
  await prisma.bioParagraph.create({ data: { ...data, order: (last?.order ?? -1) + 1 } })

  // TODO(Task 9): invalidate 'site-config'.
}

export async function updateBioParagraph(id: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const data = bioParagraphFormSchema.parse({ textEs: formData.get('textEs'), textEn: formData.get('textEn') })
  await prisma.bioParagraph.update({ where: { id }, data })

  // TODO(Task 9): invalidate 'site-config'.
}

export async function removeBioParagraph(id: string): Promise<void> {
  await requireAdmin()
  await prisma.bioParagraph.delete({ where: { id } })

  // TODO(Task 9): invalidate 'site-config'.
}

export async function moveBioParagraph(id: string, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  const current = await prisma.bioParagraph.findUniqueOrThrow({ where: { id } })
  const neighbor = await prisma.bioParagraph.findFirst({
    where: direction === 'up' ? { order: { lt: current.order } } : { order: { gt: current.order } },
    orderBy: { order: direction === 'up' ? 'desc' : 'asc' },
  })
  if (!neighbor) return

  await prisma.$transaction([
    prisma.bioParagraph.update({ where: { id: current.id }, data: { order: neighbor.order } }),
    prisma.bioParagraph.update({ where: { id: neighbor.id }, data: { order: current.order } }),
  ])

  // TODO(Task 9): invalidate 'site-config'.
}
```

- [ ] **Step 21: Write `src/test/actions/site.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn(async () => undefined) }))

const siteConfigFindUnique = vi.fn()
const siteConfigUpsert = vi.fn()
const pendingUploadFindUniqueOrThrow = vi.fn()
const bioParagraphFindFirst = vi.fn()
const bioParagraphFindUniqueOrThrow = vi.fn()
const bioParagraphCreate = vi.fn()
const bioParagraphUpdate = vi.fn()
const bioParagraphDelete = vi.fn()
const transactionMock = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    siteConfig: {
      findUnique: (...a: unknown[]) => siteConfigFindUnique(...a),
      upsert: (...a: unknown[]) => siteConfigUpsert(...a),
    },
    pendingUpload: { findUniqueOrThrow: (...a: unknown[]) => pendingUploadFindUniqueOrThrow(...a) },
    bioParagraph: {
      findFirst: (...a: unknown[]) => bioParagraphFindFirst(...a),
      findUniqueOrThrow: (...a: unknown[]) => bioParagraphFindUniqueOrThrow(...a),
      create: (...a: unknown[]) => bioParagraphCreate(...a),
      update: (...a: unknown[]) => bioParagraphUpdate(...a),
      delete: (...a: unknown[]) => bioParagraphDelete(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...(a as [Promise<unknown>[]])),
  },
}))

const claimUploadMock = vi.fn()
const deleteImageIfPresentMock = vi.fn()
vi.mock('@/lib/actions/claim-upload', () => ({
  claimUpload: (...a: unknown[]) => claimUploadMock(...a),
  deleteImageIfPresent: (...a: unknown[]) => deleteImageIfPresentMock(...a),
}))

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

const baseFields = {
  name: 'Daniel Grimaldi',
  taglineEs: 'x', taglineEn: 'x',
  email: 'a@b.com', phone: '123', whatsapp: '584',
  instagramPersonal: 'https://instagram.com/x', instagramStudio: 'https://instagram.com/y',
  bioRoleEs: 'Rol', bioRoleEn: 'Role', bioLocation: 'Valencia', bioSince: 'Desde 2021',
}

beforeEach(() => {
  siteConfigFindUnique.mockReset()
  siteConfigUpsert.mockReset()
  pendingUploadFindUniqueOrThrow.mockReset()
  bioParagraphFindFirst.mockReset()
  bioParagraphFindUniqueOrThrow.mockReset()
  bioParagraphCreate.mockReset()
  bioParagraphUpdate.mockReset()
  bioParagraphDelete.mockReset()
  transactionMock.mockClear()
  claimUploadMock.mockReset()
  deleteImageIfPresentMock.mockReset()
})

describe('updateSiteConfig', () => {
  it('keeps the existing bioPhotoPath when no new upload is provided', async () => {
    siteConfigFindUnique.mockResolvedValueOnce({ bioPhotoPath: 'site/bio-photo.jpg' })
    const { updateSiteConfig } = await import('@/lib/actions/site')
    await updateSiteConfig(formDataFor(baseFields))
    expect(siteConfigUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ bioPhotoPath: 'site/bio-photo.jpg' }) })
    )
    expect(claimUploadMock).not.toHaveBeenCalled()
  })

  it('claims a new bio photo upload at a stable site/bio-photo.{ext} path and deletes the old one', async () => {
    siteConfigFindUnique.mockResolvedValueOnce({ bioPhotoPath: 'site/bio-photo.png' })
    pendingUploadFindUniqueOrThrow.mockResolvedValueOnce({ path: 'pending/upload-9.jpg' })
    const { updateSiteConfig } = await import('@/lib/actions/site')
    const fd = formDataFor(baseFields)
    fd.set('uploadId', 'upload-9')
    await updateSiteConfig(fd)
    expect(claimUploadMock).toHaveBeenCalledWith('upload-9', 'site/bio-photo.jpg')
    expect(deleteImageIfPresentMock).toHaveBeenCalledWith('site/bio-photo.png')
  })

  it('does not delete the old photo if there was none', async () => {
    siteConfigFindUnique.mockResolvedValueOnce(null)
    pendingUploadFindUniqueOrThrow.mockResolvedValueOnce({ path: 'pending/upload-9.jpg' })
    const { updateSiteConfig } = await import('@/lib/actions/site')
    const fd = formDataFor(baseFields)
    fd.set('uploadId', 'upload-9')
    await updateSiteConfig(fd)
    expect(deleteImageIfPresentMock).not.toHaveBeenCalled()
  })
})

describe('moveBioParagraph', () => {
  it('does nothing at the boundary', async () => {
    bioParagraphFindUniqueOrThrow.mockResolvedValueOnce({ id: 'p1', order: 0 })
    bioParagraphFindFirst.mockResolvedValueOnce(null)
    const { moveBioParagraph } = await import('@/lib/actions/site')
    await moveBioParagraph('p1', 'up')
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('swaps order with the neighbor inside a transaction', async () => {
    bioParagraphFindUniqueOrThrow.mockResolvedValueOnce({ id: 'p2', order: 1 })
    bioParagraphFindFirst.mockResolvedValueOnce({ id: 'p1', order: 0 })
    const { moveBioParagraph } = await import('@/lib/actions/site')
    await moveBioParagraph('p2', 'up')
    expect(transactionMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 22: Run the test**

Run: `npm run test:run -- src/test/actions/site.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 23: Create `src/components/admin/SiteConfigForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPendingUpload } from '@/lib/actions/uploads'
import { updateSiteConfig } from '@/lib/actions/site'

interface SiteConfigFormValues {
  name: string
  taglineEs: string
  taglineEn: string
  email: string
  phone: string
  whatsapp: string
  instagramPersonal: string
  instagramStudio: string
  bioRoleEs: string
  bioRoleEn: string
  bioLocation: string
  bioSince: string
  bioPhotoUrl: string
}

export function SiteConfigForm({ initial }: { initial: SiteConfigFormValues }) {
  const router = useRouter()
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState(initial.bioPhotoUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { uploadId: id, signedUrl } = await createPendingUpload(file.name, file.type, file.size)
      const res = await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!res.ok) throw new Error('Upload failed')
      setUploadId(id)
      setPreviewUrl(URL.createObjectURL(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true)
    setError(null)
    if (uploadId) formData.set('uploadId', uploadId)
    try {
      await updateSiteConfig(formData)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-xl">
      {error && <p className="text-brand-accentLight text-sm">{error}</p>}

      <div>
        <label className="block text-sm mb-2">Foto de bio</label>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="" className="w-40 aspect-[884/546] object-cover mb-2 border border-brand-border" />
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
        {uploading && <p className="text-xs text-brand-muted mt-1">Subiendo…</p>}
      </div>

      <label className="block text-sm">Nombre
        <input name="name" defaultValue={initial.name} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Eslogan (ES)
          <input name="taglineEs" defaultValue={initial.taglineEs} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Eslogan (EN)
          <input name="taglineEn" defaultValue={initial.taglineEn} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="text-sm">Email
          <input type="email" name="email" defaultValue={initial.email} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Teléfono
          <input name="phone" defaultValue={initial.phone} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">WhatsApp
          <input name="whatsapp" defaultValue={initial.whatsapp} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Instagram personal
          <input name="instagramPersonal" defaultValue={initial.instagramPersonal} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Instagram estudio
          <input name="instagramStudio" defaultValue={initial.instagramStudio} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Rol (ES)
          <input name="bioRoleEs" defaultValue={initial.bioRoleEs} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Rol (EN)
          <input name="bioRoleEn" defaultValue={initial.bioRoleEn} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">Ubicación
          <input name="bioLocation" defaultValue={initial.bioLocation} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
        <label className="text-sm">Desde
          <input name="bioSince" defaultValue={initial.bioSince} required className="block w-full bg-brand-card border border-brand-border px-3 py-2 mt-1" />
        </label>
      </div>

      <button type="submit" disabled={submitting || uploading} className="px-6 py-3 bg-brand-accent text-sm">
        {submitting ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 24: Create `src/app/admin/(protected)/site/page.tsx`** — site config form + bio paragraph list (add/remove/reorder via plain bound Server Actions, no client JS needed for those)

```tsx
import { prisma } from '@/lib/prisma'
import { publicUrlFor } from '@/lib/storage'
import { SiteConfigForm } from '@/components/admin/SiteConfigForm'
import { addBioParagraph, updateBioParagraph, removeBioParagraph, moveBioParagraph } from '@/lib/actions/site'

export default async function AdminSitePage() {
  const [config, paragraphs] = await Promise.all([
    prisma.siteConfig.findUnique({ where: { id: 1 } }),
    prisma.bioParagraph.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
  ])

  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-display text-3xl mb-8">Configuración del sitio</h1>
        <SiteConfigForm
          initial={{
            name: config?.name ?? '',
            taglineEs: config?.taglineEs ?? '',
            taglineEn: config?.taglineEn ?? '',
            email: config?.email ?? '',
            phone: config?.phone ?? '',
            whatsapp: config?.whatsapp ?? '',
            instagramPersonal: config?.instagramPersonal ?? '',
            instagramStudio: config?.instagramStudio ?? '',
            bioRoleEs: config?.bioRoleEs ?? '',
            bioRoleEn: config?.bioRoleEn ?? '',
            bioLocation: config?.bioLocation ?? '',
            bioSince: config?.bioSince ?? '',
            bioPhotoUrl: config?.bioPhotoPath ? publicUrlFor(config.bioPhotoPath) : '',
          }}
        />
      </div>

      <div>
        <h2 className="font-display text-2xl mb-4">Párrafos de biografía</h2>
        <div className="space-y-4 max-w-2xl">
          {paragraphs.map((paragraph, index) => (
            <div key={paragraph.id} className="border border-brand-border bg-brand-card p-4">
              <form action={updateBioParagraph.bind(null, paragraph.id)} className="space-y-2">
                <textarea name="textEs" defaultValue={paragraph.textEs} required rows={2} className="block w-full bg-brand-black border border-brand-border px-3 py-2 text-sm" />
                <textarea name="textEn" defaultValue={paragraph.textEn} required rows={2} className="block w-full bg-brand-black border border-brand-border px-3 py-2 text-sm" />
                <div className="flex items-center gap-3">
                  <button type="submit" className="px-3 py-1 border border-brand-border text-xs">Guardar</button>
                  <button formAction={moveBioParagraph.bind(null, paragraph.id, 'up')} disabled={index === 0} aria-label="Mover arriba">↑</button>
                  <button formAction={moveBioParagraph.bind(null, paragraph.id, 'down')} disabled={index === paragraphs.length - 1} aria-label="Mover abajo">↓</button>
                </div>
              </form>
              <form action={removeBioParagraph.bind(null, paragraph.id)} className="mt-2">
                <button type="submit" className="text-xs text-brand-accentLight">Eliminar párrafo</button>
              </form>
            </div>
          ))}
        </div>

        <h3 className="text-sm text-brand-muted mt-6 mb-2">Añadir párrafo</h3>
        <form action={addBioParagraph} className="space-y-2 max-w-2xl">
          <textarea name="textEs" placeholder="Texto en español" required rows={2} className="block w-full bg-brand-card border border-brand-border px-3 py-2 text-sm" />
          <textarea name="textEn" placeholder="Texto en inglés" required rows={2} className="block w-full bg-brand-card border border-brand-border px-3 py-2 text-sm" />
          <button type="submit" className="px-4 py-2 border border-brand-border text-sm">Añadir</button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 25: Run the full test suite and build**

Run: `npm run test:run && npm run build`
Expected: every test file passes (including the three new `src/test/actions/*.test.ts` files); build succeeds structurally, listing every `/admin/*` route (dashboard, artworks list/new/[id], collections list/new/[id], site).

- [ ] Commit this task's changes.

---

### Task 9: Revalidation wiring across every mutating Server Action

**Files:**
- Modify: `src/lib/actions/artworks.ts`
- Modify: `src/lib/actions/collections.ts`
- Modify: `src/lib/actions/site.ts`
- Test: `src/test/actions/revalidation.test.ts`

**Interfaces:**
- Consumes: `updateTag`, `revalidatePath` from `next/cache`.
- Produces: replaces every `// TODO(Task 9): ...` comment left in Task 8 with a real invalidation call, so edits made through the admin panel actually reach the public cached pages (`/`, `/colecciones`, `/colecciones/[slug]`) instead of only being visible on the always-fresh admin pages.

Per the design doc's "Caching & revalidation": every mutating action calls `updateTag()` for the tag(s) covering the data it changed, **plus** targeted `revalidatePath()` for the concrete routes rendering that data — `revalidatePath` alone doesn't invalidate other cached reads of the same tagged data used elsewhere, so both are always used together. Paths are always literal (`revalidatePath('/colecciones/estudios')`), never the pattern form, since every mutation knows the concrete slug(s) involved.

- [ ] **Step 1: Update `src/lib/actions/artworks.ts`** — add a shared `revalidateArtworkChange` helper and call it from every mutation; `deleteArtwork` passes in memberships captured *before* the delete, since `CollectionArtwork` rows are already gone by the time an after-the-fact query would run

```typescript
'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { artworkFormSchema } from '@/lib/validation'
import { claimUpload, deleteImageIfPresent } from '@/lib/actions/claim-upload'
import type { ArtworkType, ArtworkStatus } from '@prisma/client'

interface ParsedArtworkForm {
  type: ArtworkType
  titleEs: string
  titleEn: string
  techniqueEs: string
  techniqueEn: string
  size: string
  year: string
  price: string
  status: ArtworkStatus
  isPublished: boolean
  uploadId?: string
}

function parseArtworkForm(formData: FormData): ParsedArtworkForm {
  return artworkFormSchema.parse({
    type: formData.get('type'),
    titleEs: formData.get('titleEs'),
    titleEn: formData.get('titleEn'),
    techniqueEs: formData.get('techniqueEs'),
    techniqueEn: formData.get('techniqueEn'),
    size: formData.get('size'),
    year: formData.get('year'),
    price: formData.get('price'),
    status: formData.get('status'),
    isPublished: formData.get('isPublished') === 'on',
    uploadId: formData.get('uploadId') || undefined,
  }) as ParsedArtworkForm
}

/**
 * Invalidates 'artworks' unconditionally, plus 'collections' + each specific
 * collection's own tag/path if this artwork belongs to any — its publish
 * state, text, or image affects every collection page that lists it.
 * `preloadedMemberships` lets deleteArtwork pass in data captured BEFORE its
 * delete() call, since the CollectionArtwork rows are gone immediately after.
 */
async function revalidateArtworkChange(
  artworkId: string,
  preloadedMemberships?: { collection: { slug: string } }[]
): Promise<void> {
  updateTag('artworks')
  revalidatePath('/')

  const memberships =
    preloadedMemberships ??
    (await prisma.collectionArtwork.findMany({
      where: { artworkId },
      include: { collection: true },
    }))

  if (memberships.length > 0) {
    updateTag('collections')
    revalidatePath('/colecciones')
    for (const membership of memberships) {
      updateTag(`collection:${membership.collection.slug}`)
      revalidatePath(`/colecciones/${membership.collection.slug}`)
    }
  }
}

export async function createArtwork(formData: FormData): Promise<void> {
  await requireAdmin()
  const data = parseArtworkForm(formData)
  if (!data.uploadId) throw new Error('An image is required for a new artwork')

  const last = await prisma.artwork.findFirst({ orderBy: { displayOrder: 'desc' } })
  const displayOrder = (last?.displayOrder ?? -1) + 1

  const artwork = await prisma.artwork.create({
    data: {
      type: data.type,
      titleEs: data.titleEs,
      titleEn: data.titleEn,
      techniqueEs: data.techniqueEs,
      techniqueEn: data.techniqueEn,
      size: data.size,
      year: data.year,
      price: data.price,
      status: data.status,
      isPublished: data.isPublished,
      displayOrder,
      imagePath: '',
    },
  })

  const pending = await prisma.pendingUpload.findUniqueOrThrow({ where: { id: data.uploadId } })
  const extension = pending.path.split('.').pop()
  const permanentPath = `artworks/${artwork.id}/${data.uploadId}.${extension}`
  await claimUpload(data.uploadId, permanentPath)
  await prisma.artwork.update({ where: { id: artwork.id }, data: { imagePath: permanentPath } })

  await revalidateArtworkChange(artwork.id)
}

export async function updateArtwork(id: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const data = parseArtworkForm(formData)
  const existing = await prisma.artwork.findUniqueOrThrow({ where: { id } })

  let imagePath = existing.imagePath
  if (data.uploadId) {
    const pending = await prisma.pendingUpload.findUniqueOrThrow({ where: { id: data.uploadId } })
    const extension = pending.path.split('.').pop()
    const permanentPath = `artworks/${id}/${data.uploadId}.${extension}`
    await claimUpload(data.uploadId, permanentPath)
    imagePath = permanentPath
  }

  await prisma.artwork.update({
    where: { id },
    data: {
      type: data.type,
      titleEs: data.titleEs,
      titleEn: data.titleEn,
      techniqueEs: data.techniqueEs,
      techniqueEn: data.techniqueEn,
      size: data.size,
      year: data.year,
      price: data.price,
      status: data.status,
      isPublished: data.isPublished,
      imagePath,
    },
  })

  if (data.uploadId && existing.imagePath) {
    await deleteImageIfPresent(existing.imagePath)
  }

  await revalidateArtworkChange(id)
}

export async function deleteArtwork(id: string): Promise<void> {
  await requireAdmin()
  const existing = await prisma.artwork.findUniqueOrThrow({
    where: { id },
    include: { collections: { include: { collection: true } } },
  })
  await prisma.artwork.delete({ where: { id } })
  await deleteImageIfPresent(existing.imagePath)

  // Uses the memberships captured above — querying CollectionArtwork now
  // would return nothing, since they cascaded away with the artwork.
  await revalidateArtworkChange(id, existing.collections)
}

export async function toggleArtworkPublished(id: string, isPublished: boolean): Promise<void> {
  await requireAdmin()
  await prisma.artwork.update({ where: { id }, data: { isPublished } })
  await revalidateArtworkChange(id)
}

export async function moveArtwork(id: string, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  const current = await prisma.artwork.findUniqueOrThrow({ where: { id } })
  const neighbor = await prisma.artwork.findFirst({
    where:
      direction === 'up'
        ? { displayOrder: { lt: current.displayOrder } }
        : { displayOrder: { gt: current.displayOrder } },
    orderBy: { displayOrder: direction === 'up' ? 'desc' : 'asc' },
  })
  if (!neighbor) return

  await prisma.$transaction([
    prisma.artwork.update({ where: { id: current.id }, data: { displayOrder: neighbor.displayOrder } }),
    prisma.artwork.update({ where: { id: neighbor.id }, data: { displayOrder: current.displayOrder } }),
  ])

  updateTag('artworks')
  revalidatePath('/')
}
```

- [ ] **Step 2: Update `src/lib/actions/collections.ts`** — add an `invalidateCollection(slug)` helper; `updateCollection` invalidates both the old and new slug when it changes

```typescript
'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { collectionFormSchema } from '@/lib/validation'

function invalidateCollection(slug: string): void {
  updateTag('collections')
  updateTag(`collection:${slug}`)
  revalidatePath('/colecciones')
  revalidatePath(`/colecciones/${slug}`)
}

function parseCollectionForm(formData: FormData) {
  return collectionFormSchema.parse({
    slug: formData.get('slug'),
    nameEs: formData.get('nameEs'),
    nameEn: formData.get('nameEn'),
  })
}

export async function createCollection(formData: FormData): Promise<void> {
  await requireAdmin()
  const data = parseCollectionForm(formData)

  const last = await prisma.collection.findFirst({ orderBy: { displayOrder: 'desc' } })
  await prisma.collection.create({
    data: { slug: data.slug, nameEs: data.nameEs, nameEn: data.nameEn, displayOrder: (last?.displayOrder ?? -1) + 1 },
  })

  invalidateCollection(data.slug)
}

export async function updateCollection(id: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const data = parseCollectionForm(formData)
  const coverArtworkId = (formData.get('coverArtworkId') as string) || null

  const existing = await prisma.collection.findUniqueOrThrow({ where: { id } })

  if (coverArtworkId) {
    const membership = await prisma.collectionArtwork.findUnique({
      where: { collectionId_artworkId: { collectionId: id, artworkId: coverArtworkId } },
      include: { artwork: true },
    })
    if (!membership) throw new Error('Cover must be an artwork already assigned to this collection')
    if (!membership.artwork.isPublished) throw new Error('Cover must be a published artwork')
  }

  await prisma.collection.update({
    where: { id },
    data: { slug: data.slug, nameEs: data.nameEs, nameEn: data.nameEn, coverArtworkId },
  })

  // A slug change invalidates BOTH identities — the old URL must stop
  // serving stale content before it 404s, and the new URL must start working.
  if (existing.slug !== data.slug) {
    invalidateCollection(existing.slug)
  }
  invalidateCollection(data.slug)
}

export async function deleteCollection(id: string): Promise<void> {
  await requireAdmin()
  const existing = await prisma.collection.findUniqueOrThrow({ where: { id } })
  await prisma.collection.delete({ where: { id } }) // cascades CollectionArtwork rows

  // invalidateCollection already covers 'collections' + revalidatePath('/colecciones')
  // — the grid page dropping this collection — plus this slug's own tag/path.
  invalidateCollection(existing.slug)
}

export async function moveCollection(id: string, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  const current = await prisma.collection.findUniqueOrThrow({ where: { id } })
  const neighbor = await prisma.collection.findFirst({
    where:
      direction === 'up'
        ? { displayOrder: { lt: current.displayOrder } }
        : { displayOrder: { gt: current.displayOrder } },
    orderBy: { displayOrder: direction === 'up' ? 'desc' : 'asc' },
  })
  if (!neighbor) return

  await prisma.$transaction([
    prisma.collection.update({ where: { id: current.id }, data: { displayOrder: neighbor.displayOrder } }),
    prisma.collection.update({ where: { id: neighbor.id }, data: { displayOrder: current.displayOrder } }),
  ])

  updateTag('collections')
  revalidatePath('/colecciones')
}

export async function addArtworkToCollection(collectionId: string, artworkId: string): Promise<void> {
  await requireAdmin()
  const last = await prisma.collectionArtwork.findFirst({
    where: { collectionId },
    orderBy: { position: 'desc' },
  })
  await prisma.collectionArtwork.create({
    data: { collectionId, artworkId, position: (last?.position ?? -1) + 1 },
  })

  const collection = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } })
  invalidateCollection(collection.slug)
}

export async function removeArtworkFromCollection(collectionId: string, artworkId: string): Promise<void> {
  await requireAdmin()
  const collection = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } })
  await prisma.collectionArtwork.delete({
    where: { collectionId_artworkId: { collectionId, artworkId } },
  })

  if (collection.coverArtworkId === artworkId) {
    await prisma.collection.update({ where: { id: collectionId }, data: { coverArtworkId: null } })
  }

  invalidateCollection(collection.slug)
}

export async function moveArtworkInCollection(
  collectionId: string,
  artworkId: string,
  direction: 'up' | 'down'
): Promise<void> {
  await requireAdmin()
  const current = await prisma.collectionArtwork.findUniqueOrThrow({
    where: { collectionId_artworkId: { collectionId, artworkId } },
  })
  const neighbor = await prisma.collectionArtwork.findFirst({
    where: {
      collectionId,
      position: direction === 'up' ? { lt: current.position } : { gt: current.position },
    },
    orderBy: { position: direction === 'up' ? 'desc' : 'asc' },
  })
  if (!neighbor) return

  await prisma.$transaction([
    prisma.collectionArtwork.update({
      where: { collectionId_artworkId: { collectionId, artworkId: current.artworkId } },
      data: { position: neighbor.position },
    }),
    prisma.collectionArtwork.update({
      where: { collectionId_artworkId: { collectionId, artworkId: neighbor.artworkId } },
      data: { position: current.position },
    }),
  ])

  const collection = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } })
  invalidateCollection(collection.slug)
}
```

- [ ] **Step 3: Update `src/lib/actions/site.ts`** — add an `invalidateSiteConfig()` helper and call it from every mutation

```typescript
'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { siteConfigFormSchema, bioParagraphFormSchema } from '@/lib/validation'
import { claimUpload, deleteImageIfPresent } from '@/lib/actions/claim-upload'

function invalidateSiteConfig(): void {
  updateTag('site-config')
  revalidatePath('/')
}

export async function updateSiteConfig(formData: FormData): Promise<void> {
  await requireAdmin()
  const { uploadId, ...fields } = siteConfigFormSchema.parse({
    name: formData.get('name'),
    taglineEs: formData.get('taglineEs'),
    taglineEn: formData.get('taglineEn'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    whatsapp: formData.get('whatsapp'),
    instagramPersonal: formData.get('instagramPersonal'),
    instagramStudio: formData.get('instagramStudio'),
    bioRoleEs: formData.get('bioRoleEs'),
    bioRoleEn: formData.get('bioRoleEn'),
    bioLocation: formData.get('bioLocation'),
    bioSince: formData.get('bioSince'),
    uploadId: formData.get('uploadId') || undefined,
  })

  const existing = await prisma.siteConfig.findUnique({ where: { id: 1 } })

  let bioPhotoPath = existing?.bioPhotoPath ?? ''
  if (uploadId) {
    const pending = await prisma.pendingUpload.findUniqueOrThrow({ where: { id: uploadId } })
    const extension = pending.path.split('.').pop()
    const permanentPath = `site/bio-photo.${extension}`
    await claimUpload(uploadId, permanentPath)
    if (existing?.bioPhotoPath && existing.bioPhotoPath !== permanentPath) {
      await deleteImageIfPresent(existing.bioPhotoPath)
    }
    bioPhotoPath = permanentPath
  }

  await prisma.siteConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...fields, bioPhotoPath },
    update: { ...fields, bioPhotoPath },
  })

  invalidateSiteConfig()
}

export async function addBioParagraph(formData: FormData): Promise<void> {
  await requireAdmin()
  const data = bioParagraphFormSchema.parse({ textEs: formData.get('textEs'), textEn: formData.get('textEn') })
  const last = await prisma.bioParagraph.findFirst({ orderBy: { order: 'desc' } })
  await prisma.bioParagraph.create({ data: { ...data, order: (last?.order ?? -1) + 1 } })
  invalidateSiteConfig()
}

export async function updateBioParagraph(id: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const data = bioParagraphFormSchema.parse({ textEs: formData.get('textEs'), textEn: formData.get('textEn') })
  await prisma.bioParagraph.update({ where: { id }, data })
  invalidateSiteConfig()
}

export async function removeBioParagraph(id: string): Promise<void> {
  await requireAdmin()
  await prisma.bioParagraph.delete({ where: { id } })
  invalidateSiteConfig()
}

export async function moveBioParagraph(id: string, direction: 'up' | 'down'): Promise<void> {
  await requireAdmin()
  const current = await prisma.bioParagraph.findUniqueOrThrow({ where: { id } })
  const neighbor = await prisma.bioParagraph.findFirst({
    where: direction === 'up' ? { order: { lt: current.order } } : { order: { gt: current.order } },
    orderBy: { order: direction === 'up' ? 'desc' : 'asc' },
  })
  if (!neighbor) return

  await prisma.$transaction([
    prisma.bioParagraph.update({ where: { id: current.id }, data: { order: neighbor.order } }),
    prisma.bioParagraph.update({ where: { id: neighbor.id }, data: { order: current.order } }),
  ])

  invalidateSiteConfig()
}
```

- [ ] **Step 4: Write `src/test/actions/revalidation.test.ts`** — asserts `updateTag`/`revalidatePath` are called with the exact expected tags/paths for each mutation type, including the two special cases the design doc calls out by name: a collection slug change and a collection deletion

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn(async () => undefined) }))
vi.mock('@/lib/actions/claim-upload', () => ({
  claimUpload: vi.fn(async () => undefined),
  deleteImageIfPresent: vi.fn(async () => undefined),
}))

const updateTagMock = vi.fn()
const revalidatePathMock = vi.fn()
vi.mock('next/cache', () => ({
  updateTag: (...args: unknown[]) => updateTagMock(...args),
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

const artwork = {
  findFirst: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const collection = {
  findFirst: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const collectionArtwork = {
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findMany: vi.fn(),
}
const pendingUpload = { findUniqueOrThrow: vi.fn() }
const siteConfig = { findUnique: vi.fn(), upsert: vi.fn() }
const bioParagraph = { findFirst: vi.fn(), create: vi.fn() }
const transactionMock = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))

vi.mock('@/lib/prisma', () => ({
  prisma: { artwork, collection, collectionArtwork, pendingUpload, siteConfig, bioParagraph, $transaction: (...a: unknown[]) => transactionMock(...(a as [Promise<unknown>[]])) },
}))

function formDataFor(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.set(key, value)
  return fd
}

beforeEach(() => {
  updateTagMock.mockReset()
  revalidatePathMock.mockReset()
  Object.values(artwork).forEach((fn) => fn.mockReset())
  Object.values(collection).forEach((fn) => fn.mockReset())
  Object.values(collectionArtwork).forEach((fn) => fn.mockReset())
  pendingUpload.findUniqueOrThrow.mockReset()
  siteConfig.findUnique.mockReset()
  siteConfig.upsert.mockReset()
  bioParagraph.findFirst.mockReset()
  bioParagraph.create.mockReset()
  transactionMock.mockClear()
})

const artworkFields = {
  type: 'PAINTING', titleEs: 'A', titleEn: 'A', techniqueEs: 'x', techniqueEn: 'x',
  size: '1', year: '2026', price: '$1', status: 'AVAILABLE',
}

describe('artwork mutations invalidate the right tags/paths', () => {
  it('createArtwork invalidates artworks + / (no collections yet)', async () => {
    artwork.findFirst.mockResolvedValue(null)
    artwork.create.mockResolvedValue({ id: 'new-art' })
    pendingUpload.findUniqueOrThrow.mockResolvedValue({ path: 'pending/u1.jpg' })
    collectionArtwork.findMany.mockResolvedValue([])
    const { createArtwork } = await import('@/lib/actions/artworks')
    await createArtwork(formDataFor({ ...artworkFields, uploadId: 'u1' }))
    expect(updateTagMock).toHaveBeenCalledWith('artworks')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
    expect(updateTagMock).not.toHaveBeenCalledWith('collections')
  })

  it('toggleArtworkPublished also invalidates every collection the artwork belongs to', async () => {
    artwork.findUniqueOrThrow.mockResolvedValue({})
    collectionArtwork.findMany.mockResolvedValue([{ collection: { slug: 'estudios' } }])
    const { toggleArtworkPublished } = await import('@/lib/actions/artworks')
    await toggleArtworkPublished('a1', false)
    expect(updateTagMock).toHaveBeenCalledWith('collections')
    expect(updateTagMock).toHaveBeenCalledWith('collection:estudios')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/estudios')
  })

  it('deleteArtwork invalidates collections captured BEFORE the delete (not re-queried after)', async () => {
    artwork.findUniqueOrThrow.mockResolvedValue({
      imagePath: 'artworks/a1/x.jpg',
      collections: [{ collection: { slug: 'figura-humana' } }],
    })
    const { deleteArtwork } = await import('@/lib/actions/artworks')
    await deleteArtwork('a1')
    expect(updateTagMock).toHaveBeenCalledWith('collection:figura-humana')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/figura-humana')
    // Never re-queries CollectionArtwork after the delete for this path.
    expect(collectionArtwork.findMany).not.toHaveBeenCalled()
  })
})

describe('collection mutations invalidate the right tags/paths', () => {
  it('createCollection invalidates the new slug', async () => {
    collection.findFirst.mockResolvedValue(null)
    const { createCollection } = await import('@/lib/actions/collections')
    await createCollection(formDataFor({ slug: 'nueva', nameEs: 'Nueva', nameEn: 'New' }))
    expect(updateTagMock).toHaveBeenCalledWith('collection:nueva')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/nueva')
  })

  it('updateCollection with an unchanged slug invalidates only that one slug', async () => {
    collection.findUniqueOrThrow.mockResolvedValue({ slug: 'estudios' })
    const { updateCollection } = await import('@/lib/actions/collections')
    await updateCollection('col-1', formDataFor({ slug: 'estudios', nameEs: 'Estudios', nameEn: 'Studies' }))
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/estudios')
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/colecciones/old-slug')
  })

  it('updateCollection with a slug change invalidates BOTH the old and new identity', async () => {
    collection.findUniqueOrThrow.mockResolvedValue({ slug: 'old-slug' })
    const { updateCollection } = await import('@/lib/actions/collections')
    await updateCollection('col-1', formDataFor({ slug: 'new-slug', nameEs: 'X', nameEn: 'X' }))
    expect(updateTagMock).toHaveBeenCalledWith('collection:old-slug')
    expect(updateTagMock).toHaveBeenCalledWith('collection:new-slug')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/old-slug')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/new-slug')
  })

  it('deleteCollection invalidates its slug, "collections", and the /colecciones grid', async () => {
    collection.findUniqueOrThrow.mockResolvedValue({ slug: 'toros' })
    const { deleteCollection } = await import('@/lib/actions/collections')
    await deleteCollection('col-1')
    expect(updateTagMock).toHaveBeenCalledWith('collection:toros')
    expect(updateTagMock).toHaveBeenCalledWith('collections')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones')
    expect(revalidatePathMock).toHaveBeenCalledWith('/colecciones/toros')
  })

  it('addArtworkToCollection invalidates that specific collection', async () => {
    collectionArtwork.findFirst.mockResolvedValue(null)
    collection.findUniqueOrThrow.mockResolvedValue({ slug: 'bailarinas' })
    const { addArtworkToCollection } = await import('@/lib/actions/collections')
    await addArtworkToCollection('col-2', 'art-5')
    expect(updateTagMock).toHaveBeenCalledWith('collection:bailarinas')
  })
})

describe('site config / bio mutations invalidate site-config', () => {
  it('updateSiteConfig invalidates site-config and revalidates /', async () => {
    siteConfig.findUnique.mockResolvedValue(null)
    const { updateSiteConfig } = await import('@/lib/actions/site')
    await updateSiteConfig(
      formDataFor({
        name: 'x', taglineEs: 'x', taglineEn: 'x', email: 'a@b.com', phone: '1', whatsapp: '1',
        instagramPersonal: 'https://instagram.com/x', instagramStudio: 'https://instagram.com/y',
        bioRoleEs: 'x', bioRoleEn: 'x', bioLocation: 'x', bioSince: 'x',
      })
    )
    expect(updateTagMock).toHaveBeenCalledWith('site-config')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('addBioParagraph invalidates site-config', async () => {
    bioParagraph.findFirst.mockResolvedValue(null)
    const { addBioParagraph } = await import('@/lib/actions/site')
    await addBioParagraph(formDataFor({ textEs: 'x', textEn: 'x' }))
    expect(updateTagMock).toHaveBeenCalledWith('site-config')
  })
})
```

- [ ] **Step 5: Run the test**

Run: `npm run test:run -- src/test/actions/revalidation.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Re-run every action test file to confirm nothing regressed**

Run: `npm run test:run -- src/test/actions/artworks.test.ts src/test/actions/collections.test.ts src/test/actions/site.test.ts src/test/actions/revalidation.test.ts`
Expected: PASS (all four files).

- [ ] Commit this task's changes.

---

### Task 10: Data migration script

**Files:**
- Create: `scripts/migrate-to-supabase.ts`
- Test: `src/test/migrate-to-supabase.test.ts`

**Interfaces:**
- Consumes: `artworks` (`@/data/artworks`), `collections` (`@/data/collections`), `siteConfig`/`bio` (`@/data/site`), `prisma` (Task 2), `@supabase/supabase-js` directly (a bulk `.upload({ upsert: true })` call, distinct from the admin's own signed-URL flow in Task 7 — this script runs locally with a service-role key, not through a browser).
- Produces: `migrateArtworks()`, `migrateCollections()`, `migrateSiteConfig()`, `verify(expectedCollectionArtworkCount)` — all exported for direct testing — plus the `npm run migrate-data` CLI entry point (`--apply` flag) already wired into `package.json` in Task 1.

Per the design doc's "Data migration" section: dry-run by default (prints what it would do, writes nothing), `--apply` to actually write; every write is an upsert keyed by a stable id/slug so reruns are safe; images upload to deterministic paths (`upsert: true` so a rerun overwrites rather than duplicates); `displayOrder` comes from each item's current array index; a post-write verification step re-reads the data back and fails loudly on any count mismatch or unresolvable reference.

**Decision — collection cover resolution:** the static `Collection.cover` field is a bare image filename (e.g. `"Estudio_de_Movimiento.jpg"`), but the new schema's `coverArtworkId` references one of that collection's own artworks by id (per the design doc — "a collection's cover is just a reference to one of its own artworks"). The migration resolves this by finding the artwork in `artworks` whose `img` equals the collection's `cover` string, and uses that artwork's id — failing loudly if a non-empty `cover` doesn't match any known artwork, rather than silently dropping the cover.

**Decision — `BioParagraph` has no natural stable key in the source data:** `bio.paragraphs` is a plain array of `{ es, en }` objects, with no id to upsert against. The migration treats array **index** as the stable identity for upsert purposes (update the row currently at that position, or create one if the source array grew; delete any existing row beyond the source's new length if it shrank) — safe to rerun, since a rerun with unchanged source data updates the same rows in place rather than creating duplicates.

**Decision — the script imports via the `@/*` path alias, run through `tsx` (already installed in Task 1):** `tsx` resolves `tsconfig.json`'s `paths` mapping automatically, so `scripts/migrate-to-supabase.ts` can `import { artworks } from '@/data/artworks'` exactly like application code, keeping it consistent with (and testable via) the same module specifiers Vitest already resolves for every other test file.

- [ ] **Step 1: Create `scripts/migrate-to-supabase.ts`**

```typescript
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { artworks } from '@/data/artworks'
import { collections } from '@/data/collections'
import { siteConfig, bio } from '@/data/site'
import { prisma } from '@/lib/prisma'

const APPLY = process.argv.includes('--apply')
const PUBLIC_DIR = path.join(process.cwd(), 'public')
const BUCKET = 'artwork-images'

function supabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set')
  return createClient(url, key, { auth: { persistSession: false } })
}

function extensionOf(fileName: string): string {
  const ext = fileName.split('.').pop()
  if (!ext) throw new Error(`Cannot determine extension for ${fileName}`)
  return ext
}

function contentTypeFor(extension: string): string {
  return extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
}

/** Uploads a local public/ file to a deterministic Storage path. upsert:true
 *  means a rerun overwrites the same object instead of creating a duplicate. */
async function uploadImage(localFileName: string, storagePath: string): Promise<void> {
  const localPath = path.join(PUBLIC_DIR, localFileName)
  if (!existsSync(localPath)) {
    throw new Error(`Missing local image file: ${localPath}`)
  }

  if (!APPLY) {
    console.log(`  [dry-run] would upload ${localFileName} -> ${storagePath}`)
    return
  }

  const bytes = readFileSync(localPath)
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(storagePath, bytes, { upsert: true, contentType: contentTypeFor(extensionOf(localFileName)) })
  if (error) throw new Error(`Failed to upload ${localFileName} -> ${storagePath}: ${error.message}`)
  console.log(`  uploaded ${localFileName} -> ${storagePath}`)
}

export async function migrateArtworks(): Promise<void> {
  console.log(`\nArtworks (${artworks.length} in source)`)

  for (const [index, work] of artworks.entries()) {
    const ext = extensionOf(work.img)
    // Deterministic path derived from the artwork's own stable id — NOT the
    // uploadId-based path the admin panel's own upload flow uses (Task 7),
    // since this migration has no PendingUpload row to key off of.
    const imagePath = `artworks/${work.id}/${work.id}.${ext}`

    await uploadImage(work.img, imagePath)

    if (!APPLY) {
      console.log(`  [dry-run] would upsert Artwork ${work.id} (displayOrder=${index})`)
      continue
    }

    const data = {
      type: work.type === 'painting' ? ('PAINTING' as const) : ('DRAWING' as const),
      imagePath,
      titleEs: work.title.es,
      titleEn: work.title.en,
      techniqueEs: work.technique.es,
      techniqueEn: work.technique.en,
      size: work.size,
      year: work.year,
      price: work.price,
      status: work.status === 'available' ? ('AVAILABLE' as const) : ('SOLD' as const),
      displayOrder: index,
    }

    await prisma.artwork.upsert({
      where: { id: work.id },
      create: { id: work.id, ...data, isPublished: true },
      update: data,
    })
  }
}

export async function migrateCollections(): Promise<number> {
  console.log(`\nCollections (${collections.length} in source)`)
  let collectionArtworkRowCount = 0

  for (const [index, col] of collections.entries()) {
    const coverArtwork = col.cover ? artworks.find((a) => a.img === col.cover) : undefined
    if (col.cover && !coverArtwork) {
      throw new Error(`Collection "${col.slug}" cover "${col.cover}" does not match any known artwork img`)
    }

    if (!APPLY) {
      console.log(
        `  [dry-run] would upsert Collection "${col.slug}" with ${col.workIds.length} artwork(s), cover=${coverArtwork?.id ?? 'none'}`
      )
      collectionArtworkRowCount += col.workIds.length
      continue
    }

    await prisma.collection.upsert({
      where: { slug: col.slug },
      create: {
        slug: col.slug,
        nameEs: col.name.es,
        nameEn: col.name.en,
        displayOrder: index,
        coverArtworkId: coverArtwork?.id ?? null,
      },
      update: {
        nameEs: col.name.es,
        nameEn: col.name.en,
        displayOrder: index,
        coverArtworkId: coverArtwork?.id ?? null,
      },
    })

    const collectionRow = await prisma.collection.findUniqueOrThrow({ where: { slug: col.slug } })
    for (const [position, artworkId] of col.workIds.entries()) {
      await prisma.collectionArtwork.upsert({
        where: { collectionId_artworkId: { collectionId: collectionRow.id, artworkId } },
        create: { collectionId: collectionRow.id, artworkId, position },
        update: { position },
      })
      collectionArtworkRowCount++
    }
  }

  return collectionArtworkRowCount
}

export async function migrateSiteConfig(): Promise<void> {
  console.log('\nSite config + bio')
  const bioPhotoFile = 'foto bio.jpg'
  const ext = extensionOf(bioPhotoFile)
  const bioPhotoPath = `site/bio-photo.${ext}`

  await uploadImage(bioPhotoFile, bioPhotoPath)

  if (!APPLY) {
    console.log(`  [dry-run] would upsert SiteConfig (id=1) and ${bio.paragraphs.length} BioParagraph row(s)`)
    return
  }

  const configData = {
    name: siteConfig.name,
    taglineEs: siteConfig.tagline.es,
    taglineEn: siteConfig.tagline.en,
    email: siteConfig.email,
    phone: siteConfig.phone,
    whatsapp: siteConfig.whatsapp,
    instagramPersonal: siteConfig.instagramPersonal,
    instagramStudio: siteConfig.instagramStudio,
    bioRoleEs: bio.role.es,
    bioRoleEn: bio.role.en,
    bioLocation: bio.location,
    bioSince: bio.since,
    bioPhotoPath,
  }

  await prisma.siteConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...configData },
    update: configData,
  })

  // No stable id exists in the source for bio paragraphs — array index acts
  // as the stable identity for upsert purposes (see decision above).
  const existingParagraphs = await prisma.bioParagraph.findMany({ orderBy: { order: 'asc' } })
  for (const [index, paragraph] of bio.paragraphs.entries()) {
    const existing = existingParagraphs[index]
    if (existing) {
      await prisma.bioParagraph.update({
        where: { id: existing.id },
        data: { order: index, textEs: paragraph.es, textEn: paragraph.en },
      })
    } else {
      await prisma.bioParagraph.create({ data: { order: index, textEs: paragraph.es, textEn: paragraph.en } })
    }
  }
  for (const stale of existingParagraphs.slice(bio.paragraphs.length)) {
    await prisma.bioParagraph.delete({ where: { id: stale.id } })
  }
}

/** Re-reads the written data and fails loudly on any count mismatch or
 *  unresolvable reference — run only in --apply mode, after all writes. */
export async function verify(expectedCollectionArtworkCount: number): Promise<void> {
  console.log('\nVerifying...')

  const artworkCount = await prisma.artwork.count()
  if (artworkCount !== artworks.length) {
    throw new Error(`Expected ${artworks.length} artworks, found ${artworkCount}`)
  }

  const collectionCount = await prisma.collection.count()
  if (collectionCount !== collections.length) {
    throw new Error(`Expected ${collections.length} collections, found ${collectionCount}`)
  }

  const collectionArtworkCount = await prisma.collectionArtwork.count()
  if (collectionArtworkCount !== expectedCollectionArtworkCount) {
    throw new Error(
      `Expected ${expectedCollectionArtworkCount} CollectionArtwork rows, found ${collectionArtworkCount}`
    )
  }

  const collectionsWithCovers = await prisma.collection.findMany({ where: { coverArtworkId: { not: null } } })
  for (const col of collectionsWithCovers) {
    const artworkExists = await prisma.artwork.findUnique({ where: { id: col.coverArtworkId! } })
    if (!artworkExists) {
      throw new Error(`Collection "${col.slug}" has an unresolvable coverArtworkId: ${col.coverArtworkId}`)
    }
  }

  const allMemberships = await prisma.collectionArtwork.findMany()
  for (const membership of allMemberships) {
    const artworkExists = await prisma.artwork.findUnique({ where: { id: membership.artworkId } })
    if (!artworkExists) {
      throw new Error(`CollectionArtwork row references a nonexistent artwork: ${membership.artworkId}`)
    }
  }

  console.log(
    `  OK — ${artworkCount} artworks, ${collectionCount} collections, ${collectionArtworkCount} CollectionArtwork rows, all references resolve.`
  )
}

async function main(): Promise<void> {
  console.log(
    APPLY ? 'Running in APPLY mode (will write to Supabase).' : 'Running in DRY-RUN mode (no writes — pass --apply to write).'
  )

  await migrateArtworks()
  const expectedCollectionArtworkCount = await migrateCollections()
  await migrateSiteConfig()

  if (APPLY) {
    await verify(expectedCollectionArtworkCount)
  } else {
    console.log('\nDry run complete. Re-run with --apply to write to Supabase.')
  }
}

// Only auto-run when executed directly (`npm run migrate-data`), not when
// imported by src/test/migrate-to-supabase.test.ts.
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main()
    .catch((error) => {
      console.error('\nMigration failed:', error)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
```

- [ ] **Step 2: Write `src/test/migrate-to-supabase.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => Buffer.from('fake-image-bytes')),
}))

const uploadMock = vi.fn(async () => ({ error: null }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ upload: uploadMock }) } }),
}))

vi.mock('@/data/artworks', () => ({
  artworks: [
    { id: 'a1', type: 'painting', img: 'A1.jpg', title: { es: 'A1', en: 'A1' }, technique: { es: 'x', en: 'x' }, size: '1', year: '2026', price: '$1', status: 'available' },
    { id: 'a2', type: 'drawing', img: 'A2.jpg', title: { es: 'A2', en: 'A2' }, technique: { es: 'x', en: 'x' }, size: '1', year: '2026', price: '$1', status: 'sold' },
  ],
}))

vi.mock('@/data/collections', () => ({
  collections: [
    { slug: 'coleccion-uno', name: { es: 'Colección Uno', en: 'Collection One' }, cover: 'A1.jpg', workIds: ['a1', 'a2'] },
  ],
}))

vi.mock('@/data/site', () => ({
  siteConfig: {
    name: 'Test', tagline: { es: 'x', en: 'x' }, email: 'a@b.com', phone: '1', whatsapp: '1',
    instagramPersonal: 'https://instagram.com/x', instagramStudio: 'https://instagram.com/y',
  },
  bio: { paragraphs: [{ es: 'p1', en: 'p1' }], role: { es: 'Rol', en: 'Role' }, location: 'x', since: 'x' },
}))

const artworkUpsert = vi.fn()
const artworkCount = vi.fn()
const artworkFindUnique = vi.fn()
const collectionUpsert = vi.fn()
const collectionFindUniqueOrThrow = vi.fn()
const collectionCount = vi.fn()
const collectionFindMany = vi.fn()
const collectionArtworkUpsert = vi.fn()
const collectionArtworkCount = vi.fn()
const collectionArtworkFindMany = vi.fn()
const siteConfigUpsert = vi.fn()
const bioParagraphFindMany = vi.fn(async () => [])
const bioParagraphCreate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artwork: { upsert: artworkUpsert, count: artworkCount, findUnique: artworkFindUnique },
    collection: {
      upsert: collectionUpsert,
      findUniqueOrThrow: collectionFindUniqueOrThrow,
      count: collectionCount,
      findMany: collectionFindMany,
    },
    collectionArtwork: {
      upsert: collectionArtworkUpsert,
      count: collectionArtworkCount,
      findMany: collectionArtworkFindMany,
    },
    siteConfig: { upsert: siteConfigUpsert },
    bioParagraph: { findMany: bioParagraphFindMany, create: bioParagraphCreate, update: vi.fn(), delete: vi.fn() },
    $disconnect: vi.fn(),
  },
}))

const allMocks = [
  artworkUpsert, artworkCount, artworkFindUnique, collectionUpsert, collectionFindUniqueOrThrow,
  collectionCount, collectionFindMany, collectionArtworkUpsert, collectionArtworkCount,
  collectionArtworkFindMany, siteConfigUpsert, bioParagraphCreate, uploadMock,
]

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
  allMocks.forEach((fn) => fn.mockReset())
  bioParagraphFindMany.mockResolvedValue([])
})

describe('dry-run mode (default, no --apply flag)', () => {
  it('writes nothing to Prisma or Storage', async () => {
    vi.resetModules()
    const { migrateArtworks, migrateCollections, migrateSiteConfig } = await import('../../scripts/migrate-to-supabase')
    await migrateArtworks()
    await migrateCollections()
    await migrateSiteConfig()
    expect(artworkUpsert).not.toHaveBeenCalled()
    expect(collectionUpsert).not.toHaveBeenCalled()
    expect(siteConfigUpsert).not.toHaveBeenCalled()
    expect(uploadMock).not.toHaveBeenCalled()
  })
})

describe('apply mode (--apply)', () => {
  async function withApplyFlag<T>(fn: () => Promise<T>): Promise<T> {
    vi.resetModules()
    const originalArgv = process.argv
    process.argv = [...originalArgv, '--apply']
    try {
      return await fn()
    } finally {
      process.argv = originalArgv
    }
  }

  it('assigns Artwork.displayOrder from source array index', async () => {
    await withApplyFlag(async () => {
      const { migrateArtworks } = await import('../../scripts/migrate-to-supabase')
      await migrateArtworks()
    })
    expect(artworkUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, create: expect.objectContaining({ displayOrder: 0 }) })
    )
    expect(artworkUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a2' }, create: expect.objectContaining({ displayOrder: 1 }) })
    )
  })

  it('resolves a collection cover filename to the matching artwork id', async () => {
    collectionFindUniqueOrThrow.mockResolvedValue({ id: 'col-1', slug: 'coleccion-uno' })
    await withApplyFlag(async () => {
      const { migrateCollections } = await import('../../scripts/migrate-to-supabase')
      await migrateCollections()
    })
    expect(collectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ coverArtworkId: 'a1' }) })
    )
  })

  it('uploads images with upsert:true so a rerun overwrites rather than duplicates', async () => {
    await withApplyFlag(async () => {
      const { migrateArtworks } = await import('../../scripts/migrate-to-supabase')
      await migrateArtworks()
    })
    expect(uploadMock).toHaveBeenCalledWith(
      'artworks/a1/a1.jpg',
      expect.any(Buffer),
      expect.objectContaining({ upsert: true })
    )
  })
})

describe('verify()', () => {
  it('throws when the artwork count does not match the source', async () => {
    artworkCount.mockResolvedValue(1) // fixture has 2
    const { verify } = await import('../../scripts/migrate-to-supabase')
    await expect(verify(2)).rejects.toThrow(/Expected 2 artworks/)
  })

  it('throws when a CollectionArtwork row references a nonexistent artwork', async () => {
    artworkCount.mockResolvedValue(2)
    collectionCount.mockResolvedValue(1)
    collectionArtworkCount.mockResolvedValue(2)
    collectionFindMany.mockResolvedValue([])
    collectionArtworkFindMany.mockResolvedValue([{ artworkId: 'ghost-artwork' }])
    artworkFindUnique.mockResolvedValue(null)
    const { verify } = await import('../../scripts/migrate-to-supabase')
    await expect(verify(2)).rejects.toThrow(/nonexistent artwork/)
  })

  it('passes when every count and reference resolves correctly', async () => {
    artworkCount.mockResolvedValue(2)
    collectionCount.mockResolvedValue(1)
    collectionArtworkCount.mockResolvedValue(2)
    collectionFindMany.mockResolvedValue([])
    collectionArtworkFindMany.mockResolvedValue([{ artworkId: 'a1' }, { artworkId: 'a2' }])
    artworkFindUnique.mockResolvedValue({ id: 'a1' })
    const { verify } = await import('../../scripts/migrate-to-supabase')
    await expect(verify(2)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the test**

Run: `npm run test:run -- src/test/migrate-to-supabase.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 4: Manual step (not automatable) — run a real dry-run once Supabase is provisioned**

Once Task 2/3's Supabase project exists and `.env` has real `DATABASE_URL`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` values:

Run: `npm run migrate-data`
Expected: console output lists each of the 49 artworks, 4 collections, and the bio photo it *would* upload/upsert, ending with "Dry run complete." — no database or Storage writes happen in this mode.

- [ ] **Step 5: Manual step (not automatable) — run the real migration**

Only after confirming Step 4's dry-run output looks correct:

Run: `npm run migrate-data -- --apply`
Expected: uploads 49 artwork images + the bio photo to Storage, upserts all rows, then prints "OK — 49 artworks, 4 collections, `<N>` CollectionArtwork rows, all references resolve." Re-running the same command a second time is safe and should produce identical counts (idempotent upserts).

- [ ] Commit this task's changes.

---

### Task 11: Cron cleanup route for abandoned uploads

**Files:**
- Modify: `.env.example`
- Create: `src/app/api/cron/cleanup-uploads/route.ts`
- Create: `vercel.json`
- Test: `src/test/cron-cleanup.test.ts`

**Interfaces:**
- Consumes: `CRON_SECRET` env var, `prisma` (Task 2), `deleteObject` (Task 3).
- Produces: `GET /api/cron/cleanup-uploads`, invoked daily by Vercel Cron per `vercel.json`'s schedule.

Per the design doc: a `PendingUpload` a user never submitted a form for (uploaded a file, then closed the tab) sits abandoned — this route deletes any such row (`claimedAt = null`, `createdAt` older than 24 hours) along with its Storage object, once a day.

- [ ] **Step 1: Extend `.env.example`** — add the cron secret (append below the existing `SESSION_SECRET` line)

```bash
# --- Cron ---
# Vercel automatically sends this as a Bearer token in the Authorization
# header when invoking scheduled functions (see vercel.json's cron entry),
# as long as this env var is set on the Vercel project.
CRON_SECRET=""
```

- [ ] **Step 2: Create `src/app/api/cron/cleanup-uploads/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/storage'

const ABANDONED_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours, per design doc

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - ABANDONED_UPLOAD_AGE_MS)
  const abandoned = await prisma.pendingUpload.findMany({
    where: { claimedAt: null, createdAt: { lt: cutoff } },
  })

  for (const upload of abandoned) {
    await deleteObject(upload.path)
  }

  if (abandoned.length > 0) {
    await prisma.pendingUpload.deleteMany({
      where: { id: { in: abandoned.map((u) => u.id) } },
    })
  }

  return NextResponse.json({ deleted: abandoned.length })
}
```

- [ ] **Step 3: Create `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-uploads",
      "schedule": "0 3 * * *"
    }
  ]
}
```

- [ ] **Step 4: Write `src/test/cron-cleanup.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const findManyMock = vi.fn()
const deleteManyMock = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: {
    pendingUpload: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      deleteMany: (...args: unknown[]) => deleteManyMock(...args),
    },
  },
}))

const deleteObjectMock = vi.fn()
vi.mock('@/lib/storage', () => ({ deleteObject: (...args: unknown[]) => deleteObjectMock(...args) }))

function requestWith(secret?: string): NextRequest {
  return new NextRequest('https://example.com/api/cron/cleanup-uploads', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret')
  findManyMock.mockReset().mockResolvedValue([])
  deleteManyMock.mockReset()
  deleteObjectMock.mockReset()
})

describe('GET /api/cron/cleanup-uploads', () => {
  it('rejects a request with the wrong CRON_SECRET', async () => {
    const { GET } = await import('@/app/api/cron/cleanup-uploads/route')
    const response = await GET(requestWith('wrong-secret'))
    expect(response.status).toBe(401)
  })

  it('rejects a request with no Authorization header at all', async () => {
    const { GET } = await import('@/app/api/cron/cleanup-uploads/route')
    const response = await GET(requestWith())
    expect(response.status).toBe(401)
  })

  it('queries only unclaimed uploads older than 24 hours (claimed or recent ones are excluded by the query itself)', async () => {
    const { GET } = await import('@/app/api/cron/cleanup-uploads/route')
    await GET(requestWith('test-cron-secret'))
    expect(findManyMock).toHaveBeenCalledWith({
      where: { claimedAt: null, createdAt: { lt: expect.any(Date) } },
    })
  })

  it('deletes both the Storage object and the PendingUpload row for each abandoned upload', async () => {
    findManyMock.mockResolvedValueOnce([
      { id: 'u1', path: 'pending/u1.jpg' },
      { id: 'u2', path: 'pending/u2.jpg' },
    ])
    const { GET } = await import('@/app/api/cron/cleanup-uploads/route')
    const response = await GET(requestWith('test-cron-secret'))
    expect(deleteObjectMock).toHaveBeenCalledWith('pending/u1.jpg')
    expect(deleteObjectMock).toHaveBeenCalledWith('pending/u2.jpg')
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: { in: ['u1', 'u2'] } } })
    const body = await response.json()
    expect(body).toEqual({ deleted: 2 })
  })

  it('does nothing when there are no abandoned uploads', async () => {
    const { GET } = await import('@/app/api/cron/cleanup-uploads/route')
    await GET(requestWith('test-cron-secret'))
    expect(deleteObjectMock).not.toHaveBeenCalled()
    expect(deleteManyMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5: Run the test**

Run: `npm run test:run -- src/test/cron-cleanup.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Manual step (not automatable) — set `CRON_SECRET` on the Vercel project**

In the Vercel dashboard (once this project is deployed there): Project Settings → Environment Variables → add `CRON_SECRET` with a random value (e.g. `openssl rand -base64 32`). Vercel automatically attaches it as a Bearer token to every scheduled invocation of routes matched by `vercel.json`'s `crons` entry — no additional configuration needed beyond setting the env var and deploying with `vercel.json` present.

- [ ] Commit this task's changes.

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`
Expected: every test file from Tasks 1-11 passes — data/mapping (`prisma-env-split`, `storage`, `data-mapping`), auth (`auth`, `rate-limit`), uploads (`uploads`, `claim-upload`), every public component test (`ArtworkCard`, `Lightbox`, `HeroSlideshow`, `WorksGallery`, `BioSection`, `ContactSection`, `Navbar`, `Footer`, `WhatsAppButton`, `CollectionsGrid`, `CollectionDetail`, `LanguageToggle`, `data`), every admin action test (`actions/artworks`, `actions/collections`, `actions/site`, `actions/revalidation`), `migrate-to-supabase`, and `cron-cleanup`.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors. Pay particular attention to:
- No lingering references to the deleted `src/lib/image-orientation.ts` (Task 6).
- No `@next/next/no-img-element` violations left un-suppressed on any new `<img>` tag (every one added in this plan carries the same inline disable comment the original rebuild used).
- No unused-variable warnings on the `void existing` placeholders — these were replaced with real usages in Task 9, so none should remain; if `npm run lint` flags an unused `existing` anywhere, it means a Task 9 edit was missed.

- [ ] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds (requires a reachable database by this point — Task 2/3's Supabase project must be provisioned and `.env` populated, and Task 10's migration run at least once via `npm run migrate-data -- --apply` so `/`, `/colecciones`, and `/colecciones/[slug]` have real rows to render). Routes listed should include:
- `/`, `/colecciones`, `/colecciones/[slug]` (public)
- `/admin/login`, `/admin`, `/admin/artworks`, `/admin/artworks/new`, `/admin/artworks/[id]`, `/admin/collections`, `/admin/collections/new`, `/admin/collections/[id]`, `/admin/site`
- `/api/cron/cleanup-uploads`

- [ ] **Step 4: Manual/E2E smoke checklist**

With `npm run start` running the production build (and `.env` pointing at a real, migrated Supabase project):

- [ ] Public site renders identically to the pre-migration static version: hero slideshow, works gallery filters, bio section, contact links, collections grid, collection detail pages, language toggle — all match what Tasks 3-8 of the original Next.js rebuild plan produced, now reading from the database instead of `src/data/*.ts`.
- [ ] `/admin` redirects to `/admin/login` when no session cookie is present.
- [ ] Logging in with the wrong password shows a generic error; logging in with the correct password (matching the hash generated in Task 4's `npm run hash-password`) redirects to `/admin`.
- [ ] Exceeding 5 failed login attempts within 15 minutes shows the rate-limit lockout message; waiting past the window (or clearing `LoginAttempt` rows) allows login again.
- [ ] Create a new artwork with an image upload via `/admin/artworks/new`: the image uploads directly to Storage (network tab shows a `PUT` to a Supabase signed URL, not a request through the Next.js server), the artwork appears in `/admin/artworks`, and — within the revalidation window (should be near-instant, not waiting for a cache TTL) — on `/` and in any collection it's added to.
- [ ] Edit that artwork's status to `sold`: the public gallery immediately reflects the new status/badge.
- [ ] Rename a collection's slug via `/admin/collections/[id]`: the new URL (`/colecciones/<new-slug>`) serves the collection, and the old URL now 404s instead of serving stale content.
- [ ] Delete the artwork created above: it disappears from `/`, from any collection it belonged to, and its Storage object is gone (confirm in the Supabase Storage dashboard).
- [ ] Set a collection's cover to one of its own published artworks; confirm attempting to set it to an artwork outside the collection or an unpublished artwork is rejected with an error.
- [ ] Delete an artwork that is currently set as a collection's cover: the collection page still renders (with no cover image), and `Collection.coverArtworkId` is `null` in the database — confirm via Prisma Studio (`npm run db:studio`).
- [ ] Edit the site config (tagline, contact info) and bio paragraphs (add/reorder/remove one): the public homepage reflects every change.
- [ ] Log out: `/admin` redirects back to `/admin/login`.

- [ ] **Step 5: Confirm the abandoned-upload cron logic against a real (but stale) `PendingUpload` row**

Manually insert a `PendingUpload` row via Prisma Studio with `createdAt` set more than 24 hours in the past and `claimedAt = null`, plus a matching (fake) object path. Hit `/api/cron/cleanup-uploads` locally with the correct `Authorization: Bearer <CRON_SECRET>` header (e.g. via `curl`) and confirm the row and its Storage object (if one exists at that path) are both gone afterward, while a fresh/claimed row is left untouched.

- [ ] **Step 6: Final review checklist**

- [ ] `src/data/*.ts` and root `public/*.jpg` files are still present and untouched (per the design doc, their removal is a deliberate future decision, not part of this plan).
- [ ] No component outside `src/lib/data.ts` imports `titleEs`/`nameEs`/or any other flat DB field name directly — the Bilingual-shaped mapping layer is the only place that reshapes Prisma rows (Task 5's decision).
- [ ] Every mutating Server Action's first line is `await requireAdmin()` — spot-check `src/lib/actions/{artworks,collections,site,uploads,auth-actions}.ts`.
- [ ] `src/lib/prisma.ts` contains no reference to `DIRECT_URL`; `prisma.config.ts` contains no reference to `DATABASE_URL` (re-run `src/test/prisma-env-split.test.ts` if in doubt).

- [ ] Commit this task's changes (if any — this task is primarily verification; commit only if Step 6's checklist surfaced a fix that needed a code change).

(No further action — actual Vercel deployment/cutover from the still-present static `src/data/*.ts` files to this database-backed version is a deliberate, separate decision, per the design doc's "Data migration" section, and is out of scope for this plan.)
