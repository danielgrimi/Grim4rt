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
      imagePath: '', // set below once the permanent path is known
    },
  })

  const pending = await prisma.pendingUpload.findUniqueOrThrow({ where: { id: data.uploadId } })
  const extension = pending.path.split('.').pop()
  const permanentPath = `artworks/${artwork.id}/${data.uploadId}.${extension}`
  await claimUpload(data.uploadId, permanentPath)

  try {
    await prisma.artwork.update({ where: { id: artwork.id }, data: { imagePath: permanentPath } })
  } catch (err) {
    // The image was already moved to its permanent path by claimUpload above,
    // but the row was never updated to reference it — without this cleanup
    // the file would be stranded in storage forever with nothing pointing to
    // it. The row itself is left with imagePath: '' for the admin to retry.
    await deleteImageIfPresent(permanentPath)
    throw err
  }

  await revalidateArtworkChange(artwork.id)
}

export async function updateArtwork(id: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const data = parseArtworkForm(formData)
  const existing = await prisma.artwork.findUniqueOrThrow({ where: { id } })

  let imagePath = existing.imagePath
  let claimedNewImage = false
  if (data.uploadId) {
    const pending = await prisma.pendingUpload.findUniqueOrThrow({ where: { id: data.uploadId } })
    const extension = pending.path.split('.').pop()
    const permanentPath = `artworks/${id}/${data.uploadId}.${extension}`
    await claimUpload(data.uploadId, permanentPath)
    claimedNewImage = true
    imagePath = permanentPath
  }

  try {
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
  } catch (err) {
    // Same orphan-cleanup rationale as createArtwork: the new image is
    // already sitting at its permanent path, but the row update that would
    // reference it failed — delete it rather than leaving it stranded. The
    // OLD image is untouched since the row still points at it.
    if (claimedNewImage) {
      await deleteImageIfPresent(imagePath)
    }
    throw err
  }

  // Orphan cleanup: only delete the old image once the new one is claimed
  // and the row is updated, and only if an image was actually replaced.
  if (claimedNewImage && existing.imagePath) {
    await deleteImageIfPresent(existing.imagePath)
  }

  await revalidateArtworkChange(id)
}

export async function deleteArtwork(id: string): Promise<void> {
  await requireAdmin()
  // Membership must be read BEFORE delete() — CollectionArtwork rows cascade
  // away with the artwork, so revalidation needs this captured now.
  const existing = await prisma.artwork.findUniqueOrThrow({
    where: { id },
    include: { collections: { include: { collection: true } } },
  })
  await prisma.artwork.delete({ where: { id } }) // cascades CollectionArtwork; SetNull on any Collection.coverArtworkId
  await deleteImageIfPresent(existing.imagePath)

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
  if (!neighbor) return // already at the boundary

  await prisma.$transaction([
    prisma.artwork.update({ where: { id: current.id }, data: { displayOrder: neighbor.displayOrder } }),
    prisma.artwork.update({ where: { id: neighbor.id }, data: { displayOrder: current.displayOrder } }),
  ])

  updateTag('artworks')
  revalidatePath('/')
}
