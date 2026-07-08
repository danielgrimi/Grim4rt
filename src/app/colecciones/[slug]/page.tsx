import { notFound } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'
import { CollectionDetail } from '@/components/collections/CollectionDetail'
import { collections } from '@/data/collections'

export function generateStaticParams() {
  return collections.map((collection) => ({ slug: collection.slug }))
}

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const exists = collections.some((c) => c.slug === slug)
  if (!exists) notFound()

  return (
    <>
      <Navbar />
      <main className="pt-24">
        <CollectionDetail slug={slug} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}
