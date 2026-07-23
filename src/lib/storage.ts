import 'server-only'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'artwork-images'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY are not set')
  }
  // The secret key bypasses RLS — safe here because this module only ever
  // runs server-side (Server Actions, Server Components, scripts), never in
  // a Client Component bundle.
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

/** Deletes an orphaned object (image replaced or artwork/collection change). Never
 *  throws — a failed best-effort cleanup shouldn't roll back a DB write that already
 *  succeeded, and shouldn't block the response the admin is waiting on. */
export async function deleteObject(path: string): Promise<void> {
  const { error } = await getClient().storage.from(BUCKET).remove([path])
  if (error) {
    console.error(`Failed to delete storage object ${path}:`, error.message)
  }
}
