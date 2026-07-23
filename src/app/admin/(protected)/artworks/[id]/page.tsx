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
          imageUrl: artwork.imagePath ? publicUrlFor(artwork.imagePath) : '',
        }}
      />
    </div>
  )
}
