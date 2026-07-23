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
 * function's own body — Server Actions have a 1MB default body limit, too
 * small for photos).
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
