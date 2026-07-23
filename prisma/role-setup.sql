-- prisma/role-setup.sql
--
-- NOT EXECUTED. Prepared for a one-time manual run in the Supabase SQL
-- Editor once the project + schema exist, before pointing DATABASE_URL /
-- DIRECT_URL at it. Replace __PRISMA_ROLE_PASSWORD__ with a generated value
-- (e.g. `openssl rand -base64 24`) before running — never commit the real
-- password, and never paste it into a chat/conversation log.
--
-- Why a dedicated role instead of the default `postgres` superuser:
-- DATABASE_URL/DIRECT_URL currently authenticate as `postgres`, which can do
-- anything in the project (drop schemas, alter roles, disable RLS
-- everywhere). A leaked connection string for a low-traffic single-admin app
-- is a much bigger blast radius than it needs to be — this role can only
-- touch the six application tables below.
--
-- Run order: 1-6 below, once, in the Supabase SQL Editor. Afterwards, update
-- DATABASE_URL / DIRECT_URL to authenticate as `prisma` instead of
-- `postgres` (same host/port/dbname, different user+password) — Supabase's
-- own "Connect > ORMs > Prisma" tab documents the exact connection-string
-- rewrite (swap the `postgres.<project-ref>` username for
-- `prisma.<project-ref>`).

-- 1. Create the role. LOGIN lets it authenticate; BYPASSRLS matches the
--    "RLS blocks the anon/authenticated Data API, this app role bypasses
--    it, zero per-table policies needed" design (see step 6).
CREATE ROLE prisma WITH LOGIN PASSWORD '__PRISMA_ROLE_PASSWORD__' BYPASSRLS;

-- 2. Let it connect to the database and use the public schema.
GRANT CONNECT ON DATABASE postgres TO prisma;
GRANT USAGE ON SCHEMA public TO prisma;

-- 3. Runtime table privileges. Explicit list (not ALL TABLES) so a future
--    table added outside a migration doesn't silently become writable by
--    this role until re-granted here.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Artwork", "Collection", "CollectionArtwork", "SiteConfig", "BioParagraph", "PendingUpload"
  TO prisma;

-- 4. Sequences/identity columns these tables might rely on in the future —
--    the current schema uses cuid() defaults (no sequences), but this keeps
--    any later serial/identity column working without a manual re-grant.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO prisma;

-- 5. Migrations run as this same role (DIRECT_URL), so it needs to create/
--    alter tables — broader than the runtime grants above, matching a
--    normal single-role Prisma migration workflow. Tables this role creates
--    are owned by it, so subsequent ALTER/DROP via `prisma migrate` works
--    without extra ownership grants.
GRANT CREATE ON SCHEMA public TO prisma;

-- 6. Enable RLS on every application table, with zero explicit policies —
--    this alone blocks all access via Supabase's anon/authenticated Data
--    API (PostgREST), while `prisma` (BYPASSRLS) and `postgres` (superuser)
--    are unaffected. No policies means "deny all" for any role that isn't
--    exempt from RLS.
ALTER TABLE "Artwork" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Collection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CollectionArtwork" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BioParagraph" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingUpload" ENABLE ROW LEVEL SECURITY;

-- Notes:
--   - Table names above assume Prisma's default (no @@map) naming — the
--     exact model name from prisma/schema.prisma, case-sensitive, hence the
--     double quotes. If schema.prisma ever adds @@map(...) overrides,
--     update the names here to match.
--   - This script is idempotent-unfriendly on purpose (CREATE ROLE fails if
--     it already exists) — that's intentional, so a second accidental run
--     surfaces loudly instead of silently reusing/resetting a password.
