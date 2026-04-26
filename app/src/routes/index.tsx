import { createFileRoute } from '@tanstack/react-router'
import { HomeHeader } from '../components/home/HomeHeader'
import { HomeHero } from '../components/home/HomeHero'
import { HomeBenefits } from '../components/home/HomeBenefits'
import { HomeUseCases } from '../components/home/HomeUseCases'
import { HomeTechnicalSection } from '../components/home/HomeTechnicalSection'
import { HomeIntegrations } from '../components/home/HomeIntegrations'
import { HomeTestimonials } from '../components/home/HomeTestimonials'
import { HomePricing } from '../components/home/HomePricing'
import { HomeFaq } from '../components/home/HomeFaq'
import { HomeFooter } from '../components/home/HomeFooter'

function HomePage() {
  return (
    <>
      <HomeHeader />
      <main className="pt-16 bg-[#f8f9ff] text-slate-900">
        <HomeHero />
        <HomeBenefits />
        <HomeUseCases />
        <HomeTechnicalSection />
        <HomeIntegrations />
        <HomeTestimonials />
        <HomePricing />
        <HomeFaq />
      </main>
      <HomeFooter />
    </>
  )
}

export const Route = createFileRoute('/')({ component: HomePage })
