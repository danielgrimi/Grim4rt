// prisma.config.ts
//
// Prisma 7 config file — replaces the `datasource db { url = env(...) }`
// pattern. Connection strings live here (CLI) and in src/lib/prisma.ts
// (runtime) instead of in schema.prisma — see the "Two database
// connections" note in docs/superpowers/specs/2026-07-14-admin-panel-design.md.
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'
import path from 'node:path'

// dotenv doesn't override an already-set var, so loading .env.local first
// gives it precedence over .env, matching Next.js's own env file precedence.
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    // Supavisor SESSION pooler (port 5432) — used only by `prisma migrate`,
    // `prisma db push`, and Prisma Studio. The runtime Prisma Client
    // (src/lib/prisma.ts) reads a separate connection string and never
    // imports this file.
    url: process.env.DIRECT_URL,
  },
})
