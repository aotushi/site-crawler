import { createFileRoute } from '@tanstack/react-router'
import { HomeHero } from '../components/home/HomeHero'
import { HomeBenefits } from '../components/home/HomeBenefits'
import { HomeUseCases } from '../components/home/HomeUseCases'
import { HomeCaseStudies } from '../components/home/HomeCaseStudies'
import { HomeTechnicalSection } from '../components/home/HomeTechnicalSection'
import { HomeIntegrations } from '../components/home/HomeIntegrations'
import { HomeTestimonials } from '../components/home/HomeTestimonials'
import { HomePricing } from '../components/home/HomePricing'
import { HomeFaq } from '../components/home/HomeFaq'
import { HomeFooter } from '../components/home/HomeFooter'
import { LandingPrompt } from '../components/LandingPrompt'

function HomePage() {
  return (
    <>
      <LandingPrompt />
      <main className="bg-[var(--sc-bg)] pt-16 text-[var(--sc-text)]">
        <HomeHero />
        <HomeBenefits />
        <HomeUseCases />
        <HomeCaseStudies />
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
