import { createFileRoute } from '@tanstack/react-router'
import { Hero } from '../components/Hero'
import { Features } from '../components/Features'
import { HowItWorks } from '../components/HowItWorks'
import { CaseStudies } from '../components/CaseStudies'
import { CTABanner } from '../components/CTABanner'

export const Route = createFileRoute('/')({
  component: () => (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <CaseStudies />
      <CTABanner />
    </>
  ),
})
