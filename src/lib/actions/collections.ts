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

  // An artwork that's removed from a collection can no longer validly be its cover.
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
