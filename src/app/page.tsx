import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { WhatsAppButton } from '@/components/layout/WhatsAppButton'
import { HeroSlideshow } from '@/components/sections/HeroSlideshow'
import { WorksGallery } from '@/components/sections/WorksGallery'
import { BioSection } from '@/components/sections/BioSection'
import { ContactSection } from '@/components/sections/ContactSection'

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSlideshow />
        <WorksGallery />
        <BioSection />
        <ContactSection />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}
