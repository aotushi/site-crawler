import { render, screen } from '@testing-library/react'
import { HomeHeader } from './HomeHeader'
import { HomeBenefits } from './HomeBenefits'
import { HomeFaq } from './HomeFaq'
import { HomeFooter } from './HomeFooter'

describe('stitched homepage sections', () => {
  it('renders stitched brand and benefit headings', () => {
    render(
      <>
        <HomeHeader />
        <HomeBenefits />
      </>
    )

    expect(screen.getByText('SiteCrawler')).toBeInTheDocument()
    expect(screen.getByText('Ultra-Fast Crawling')).toBeInTheDocument()
    expect(screen.getByText('Complete Packaging')).toBeInTheDocument()
  })

  it('renders faq and stitched footer content', () => {
    render(
      <>
        <HomeFaq />
        <HomeFooter />
      </>
    )

    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument()
    expect(screen.getByText('© 2024 SiteCrawler. All rights reserved. Powered by Cloudflare.')).toBeInTheDocument()
  })
})
