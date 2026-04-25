import { createFileRoute } from '@tanstack/react-router'
import { Hero } from '../components/Hero'
import { HowItWorks } from '../components/HowItWorks'
import { CaseStudies } from '../components/CaseStudies'

export const Route = createFileRoute('/')({
  component: () => (
    <>
      <Hero />
      <HowItWorks />
      <CaseStudies />
    </>
  ),
})
