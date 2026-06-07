import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { HomeHeader } from './HomeHeader'
import { HomeBenefits } from './HomeBenefits'
import { HomeFaq } from './HomeFaq'
import { HomeFooter } from './HomeFooter'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...props}>{children}</a>
  ),
  useRouterState: () => '/',
}))

describe('stitched homepage sections', () => {
  it('renders stitched brand and benefit headings', () => {
    render(
      <>
        <HomeHeader />
        <HomeBenefits />
      </>
    )

    expect(screen.getByText('SiteCrawler')).toBeInTheDocument()
    expect(screen.getByText(/边缘并发抓取|Edge parallel crawl/)).toBeInTheDocument()
    expect(screen.getByText(/链接关系保真|Link fidelity/)).toBeInTheDocument()
  })

  it('renders faq and stitched footer content', () => {
    render(
      <>
        <HomeFaq />
        <HomeFooter />
      </>
    )

    expect(screen.getByText(/常见问题|Frequently Asked Questions/)).toBeInTheDocument()
    expect(screen.getAllByText(/SiteCrawler/).length).toBeGreaterThan(0)
  })
})
