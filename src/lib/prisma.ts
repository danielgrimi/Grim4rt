import 'server-only'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

declare global {
  var __prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  // Supavisor TRANSACTION pooler (port 6543) — see prisma.config.ts for the
  // migration-time SESSION pooler counterpart. This file must only ever read
  // the runtime connection string above (asserted by
  // src/test/prisma-env-split.test.ts).
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

// Reuse a single client across hot reloads in dev (avoids exhausting the
// pooler's connection slots); always fresh in production serverless.
function getPrismaClient(): PrismaClient {
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient()
  }
  return globalThis.__prisma
}

// NEXT_PHASE is set by Next.js itself, not us — 'phase-production-build' only
// during `next build`. Every /admin page is dynamic (gated by requireAdmin(),
// see the Suspense boundary in its layout), but with cacheComponents on,
// Next still executes each dynamic route once during the build's
// static-shell pass to catalog its Suspense boundaries. Without a database
// there (e.g. this repo before Supabase is provisioned), that pass would
// otherwise crash the whole build on the first real query.
function isBuildPhaseWithoutDatabase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build' && !process.env.DATABASE_URL
}

/** Stubs only the read methods our admin Server Components call directly
 *  (list/detail/dashboard pages) — mutations always go through Server
 *  Actions, which this build-time pass never executes. */
function buildTimeStubMethod(methodName: string) {
  return async () => {
    if (methodName === 'findMany') return []
    if (methodName === 'findFirst' || methodName === 'findUnique') return null
    if (methodName === 'count') return 0
    throw new Error(
      `prisma.<model>.${methodName}() was called during the production build's static-shell pass ` +
        'with no DATABASE_URL set. Only findMany/findFirst/findUnique/count are stubbed for that ' +
        'pass — this call needs a real database connection to build.'
    )
  }
}

const buildTimeModelStub = new Proxy(
  {},
  { get: (_target, methodName: string) => buildTimeStubMethod(methodName) }
)

// A Proxy defers the DATABASE_URL read (and the real client construction)
// until the first actual query — importing this module, or even importing
// modules that import it, must never throw just because no `.env` is
// present (e.g. during `next build` or `next lint`, which both load the
// module graph without a live database).
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (isBuildPhaseWithoutDatabase()) {
      return buildTimeModelStub
    }
    return Reflect.get(getPrismaClient() as object, prop, receiver)
  },
})
