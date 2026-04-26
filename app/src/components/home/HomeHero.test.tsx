import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeHero } from './HomeHero'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<object>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

describe('HomeHero', () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })

  it('shows validation message for invalid URL', async () => {
    const user = userEvent.setup()
    render(<HomeHero />)

    await user.type(screen.getByPlaceholderText('https://example.com'), 'abc')
    await user.click(screen.getByRole('button', { name: /start crawling/i }))

    expect(screen.getByText('Please enter a valid URL starting with http:// or https://')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('navigates to crawl with url search param when valid', async () => {
    const user = userEvent.setup()
    render(<HomeHero />)

    await user.type(screen.getByPlaceholderText('https://example.com'), 'https://example.com')
    await user.click(screen.getByRole('button', { name: /start crawling/i }))

    expect(navigateMock).toHaveBeenCalledWith({ to: '/crawl', search: { url: 'https://example.com' } })
  })
})
