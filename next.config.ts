import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Enables the "use cache" directive + cacheTag()/updateTag() used by
  // src/lib/data.ts and every mutating Server Action's invalidation calls.
  cacheComponents: true,
}

export default nextConfig
