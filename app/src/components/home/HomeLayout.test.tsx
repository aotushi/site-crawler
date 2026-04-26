import { render, screen } from '@testing-library/react'
import { HomeHeader } from './HomeHeader'
import { HomeBenefits } from './HomeBenefits'

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
})
