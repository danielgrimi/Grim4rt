import 'server-only'
import { prisma } from '@/lib/prisma'
import { objectExists, moveObject, deleteObject } from '@/lib/storage'

const MAX_PENDING_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Claims a previously-issued PendingUpload: verifies it exists, hasn't
 * already been claimed, and hasn't expired — then confirms the Storage
 * object actually exists at the recorded path (the claim is verified
 * server-side, never trusted from the client's uploadId alone) before
 * moving it to its permanent path and marking the row claimed.
 *
 * Not a Server Action itself (no 'use server' directive, not directly
 * form-bindable) — always called from within an artwork/collection Server
 * Action that has already run requireAdmin() as its first line.
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

/** Best-effort delete of a now-orphaned image (replaced image, or a deleted artwork/collection cover). */
export async function deleteImageIfPresent(path: string | null | undefined): Promise<void> {
  if (!path) return
  await deleteObject(path)
}
