import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'
import { CollectionsGrid } from '@/components/collections/CollectionsGrid'

export default function CollectionsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24">
        <CollectionsGrid />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}
