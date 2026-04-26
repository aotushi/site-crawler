# Site Crawler Homepage Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only the `/` homepage with the Stitch-generated landing page using componentized React code, while keeping all other routes and backend behavior unchanged.

**Architecture:** Keep TanStack Router structure intact and replace homepage composition only. Split Stitch layout into focused React components under `app/src/components/home/`, keep hero URL validation + `/crawl` navigation behavior, and render Stitch-style header/footer only on `/` by conditionally hiding global shell nav/footer on the homepage.

**Tech Stack:** React 19, TanStack Router, TypeScript, Tailwind CSS v4, Vitest + React Testing Library

---

## File Structure Plan

- Modify: `app/package.json` (test scripts + test deps)
- Modify: `app/src/index.css` (font/icon imports + homepage pattern utility)
- Modify: `app/src/routes/__root.tsx` (hide global nav/footer on `/` only)
- Modify: `app/src/routes/index.tsx` (compose new homepage sections)
- Create: `app/src/components/home/HomeHeader.tsx`
- Create: `app/src/components/home/HomeHero.tsx`
- Create: `app/src/components/home/HomeBenefits.tsx`
- Create: `app/src/components/home/HomeUseCases.tsx`
- Create: `app/src/components/home/HomeTechnicalSection.tsx`
- Create: `app/src/components/home/HomeIntegrations.tsx`
- Create: `app/src/components/home/HomeTestimonials.tsx`
- Create: `app/src/components/home/HomePricing.tsx`
- Create: `app/src/components/home/HomeFaq.tsx`
- Create: `app/src/components/home/HomeFooter.tsx`
- Create: `app/src/components/home/MaterialIcon.tsx`
- Create: `app/src/components/home/HomeHero.test.tsx`
- Create: `app/src/components/home/HomeLayout.test.tsx`
- Create: `app/src/test/setup.ts`
- Modify: `app/vite.config.ts` (Vitest config block)

---

### Task 1: Add test harness before homepage refactor

**Files:**
- Modify: `app/package.json`
- Modify: `app/vite.config.ts`
- Create: `app/src/test/setup.ts`

- [ ] **Step 1: Write failing test bootstrap check**

Create `app/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Create a temporary test command run expectation (it fails before deps are added):

Run: `npm run test -- --run`
Expected: `npm ERR! Missing script: "test"`

- [ ] **Step 2: Add test scripts and dependencies**

Update `app/package.json` scripts and devDependencies:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.6.1",
    "jsdom": "^26.1.0",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 3: Configure Vitest in Vite config**

Update `app/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), TanStackRouterVite(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 4: Run tests to verify harness works**

Run: `npm run test:run`
Expected: exit code 0 with `No test files found`

- [ ] **Step 5: Commit**

```bash
git add app/package.json app/vite.config.ts app/src/test/setup.ts
git commit -m "test: add vitest and testing-library harness for homepage refactor"
```

---

### Task 2: Build Stitch homepage component set

**Files:**
- Create: `app/src/components/home/MaterialIcon.tsx`
- Create: `app/src/components/home/HomeHeader.tsx`
- Create: `app/src/components/home/HomeHero.tsx`
- Create: `app/src/components/home/HomeBenefits.tsx`
- Create: `app/src/components/home/HomeUseCases.tsx`
- Create: `app/src/components/home/HomeTechnicalSection.tsx`
- Create: `app/src/components/home/HomeIntegrations.tsx`
- Create: `app/src/components/home/HomeTestimonials.tsx`
- Create: `app/src/components/home/HomePricing.tsx`
- Create: `app/src/components/home/HomeFaq.tsx`
- Create: `app/src/components/home/HomeFooter.tsx`
- Modify: `app/src/index.css`

- [ ] **Step 1: Write failing layout test before components exist**

Create `app/src/components/home/HomeLayout.test.tsx`:

```tsx
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
```

Run: `npm run test:run -- HomeLayout.test.tsx`
Expected: FAIL with module not found for `./HomeHeader`.

- [ ] **Step 2: Create icon wrapper to replace material span repetition**

Create `app/src/components/home/MaterialIcon.tsx`:

```tsx
interface Props {
  name: string
  className?: string
}

export function MaterialIcon({ name, className }: Props) {
  return <span className={`material-symbols-outlined ${className ?? ''}`.trim()}>{name}</span>
}
```

- [ ] **Step 3: Create homepage structural components from Stitch HTML**

Implement each file with direct section responsibility and Tailwind classes copied from Stitch output. Keep static text/images same as Stitch export in this stage.

`HomeHeader.tsx` should include brand and menu shell.
`HomeBenefits.tsx` should include 3 cards (`Ultra-Fast Crawling`, `Complete Packaging`, `Zero Installation`).
`HomeUseCases.tsx`, `HomeTechnicalSection.tsx`, `HomeIntegrations.tsx`, `HomeTestimonials.tsx`, `HomePricing.tsx`, `HomeFaq.tsx`, `HomeFooter.tsx` should map 1:1 to Stitch section blocks.

- [ ] **Step 4: Add global homepage style prerequisites**

Update `app/src/index.css`:

```css
@import 'tailwindcss';
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.hero-pattern {
  background-color: #f8f9ff;
  background-image: radial-gradient(#004ac6 0.5px, transparent 0.5px), radial-gradient(#004ac6 0.5px, #f8f9ff 0.5px);
  background-size: 20px 20px;
  background-position: 0 0, 10px 10px;
  opacity: 0.05;
}
```

- [ ] **Step 5: Run section layout test to verify pass**

Run: `npm run test:run -- HomeLayout.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/home app/src/index.css
git commit -m "feat: add stitched homepage section components"
```

---

### Task 3: Implement Hero URL validation and `/crawl` navigation

**Files:**
- Create: `app/src/components/home/HomeHero.tsx`
- Create: `app/src/components/home/HomeHero.test.tsx`

- [ ] **Step 1: Write failing Hero behavior tests**

Create `app/src/components/home/HomeHero.test.tsx`:

```tsx
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
```

Run: `npm run test:run -- HomeHero.test.tsx`
Expected: FAIL because `HomeHero` not implemented.

- [ ] **Step 2: Implement HomeHero minimal passing behavior**

Create `app/src/components/home/HomeHero.tsx`:

```tsx
import { FormEvent, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MaterialIcon } from './MaterialIcon'

export function HomeHero() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid')
      setError('')
      navigate({ to: '/crawl', search: { url } })
    } catch {
      setError('Please enter a valid URL starting with http:// or https://')
    }
  }

  return (
    <section className="relative overflow-hidden py-24 px-6">
      <div className="absolute inset-0 hero-pattern -z-10" />
      <div className="max-w-[1200px] mx-auto text-center">
        <span className="inline-block py-1 px-3 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold mb-6">v2.0 NOW LIVE</span>
        <h1 className="text-5xl font-extrabold text-slate-900 mb-6 max-w-3xl mx-auto">One-Click Static Website Downloader</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10">
          Archive any website in seconds. Our high-performance crawler packages all assets—HTML, CSS, JS, and images—into a perfectly structured ZIP file.
        </p>

        <form onSubmit={onSubmit} className="max-w-xl mx-auto bg-white p-2 rounded-xl shadow-lg border border-slate-200 flex flex-col md:flex-row gap-2">
          <div className="flex-grow flex items-center px-4 bg-white rounded-lg border border-slate-100">
            <MaterialIcon name="link" className="text-slate-500" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full border-none focus:ring-0 text-base bg-transparent h-12 outline-none"
              placeholder="https://example.com"
              type="text"
            />
          </div>
          <button type="submit" className="bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
            Start Crawling
            <MaterialIcon name="rocket_launch" />
          </button>
        </form>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Run Hero tests to verify pass**

Run: `npm run test:run -- HomeHero.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/home/HomeHero.tsx app/src/components/home/HomeHero.test.tsx
git commit -m "feat: add stitched hero with url validation and crawl navigation"
```

---

### Task 4: Wire homepage route and isolate shell nav/footer behavior

**Files:**
- Modify: `app/src/routes/index.tsx`
- Modify: `app/src/routes/__root.tsx`

- [ ] **Step 1: Write failing integration expectation via route-level render test**

Extend `app/src/components/home/HomeLayout.test.tsx` with footer/faq assertions:

```tsx
import { HomeFaq } from './HomeFaq'
import { HomeFooter } from './HomeFooter'

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
```

Run: `npm run test:run -- HomeLayout.test.tsx`
Expected: FAIL if components are not yet wired.

- [ ] **Step 2: Replace homepage route composition**

Update `app/src/routes/index.tsx`:

```tsx
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
```

- [ ] **Step 3: Hide global nav/footer on homepage only**

Update `app/src/routes/__root.tsx`:

```tsx
import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { LangContext, useLangProvider } from '../lib/i18n'
import { NavBar } from '../components/NavBar'
import { Footer } from '../components/Footer'

function RootLayout() {
  const langCtx = useLangProvider()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isHome = pathname === '/'

  return (
    <LangContext.Provider value={langCtx}>
      <div className="min-h-screen flex flex-col">
        {!isHome && <NavBar />}
        <main className="flex-1">
          <Outlet />
        </main>
        {!isHome && <Footer />}
      </div>
    </LangContext.Provider>
  )
}

export const Route = createRootRoute({ component: RootLayout })
```

- [ ] **Step 4: Run tests and build verification**

Run: `npm run test:run`
Expected: PASS.

Run: `npm run build`
Expected: Vite build success with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/routes/index.tsx app/src/routes/__root.tsx app/src/components/home/HomeLayout.test.tsx
git commit -m "feat: wire stitched homepage and scope global shell to non-home routes"
```

---

### Task 5: Final verification and self-maintenance docs updates

**Files:**
- Modify: `docs/superpowers/specs/2026-04-25-site-crawler-homepage-replacement-design.md`
- Modify: `.project/NOW.md`
- Modify: `README.md` (project root for site-crawler)

- [ ] **Step 1: Verify homepage behavior manually**

Run:

```bash
npm run dev
```

Manual checks:
1. `/` shows stitched layout and sections.
2. invalid URL in hero shows validation text.
3. valid URL navigates to `/crawl?url=https%3A%2F%2Fexample.com`.
4. `/crawl`, `/history`, `/auth/login`, `/auth/register` keep prior behavior.

- [ ] **Step 2: Update task/spec history entry**

Append a new row in `docs/superpowers/specs/2026-04-25-site-crawler-homepage-replacement-design.md` change log:

```md
| 2026-04-25 | 实现完成：首页已替换为 Stitch 组件化版本并通过构建与交互验证 | Claude |
```

- [ ] **Step 3: Update NOW.md completion section**

Add one completed line under `## ✅ 本周已完成` in `.project/NOW.md`:

```md
- ✅ [site-crawler] 首页已替换为 Stitch 版本（组件化）并保持 /crawl 等路由不变
```

- [ ] **Step 4: Update README last-updated field**

In `resume/site-crawler/README.md`, update the `最后更新` date to `2026-04-25`.

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/specs/2026-04-25-site-crawler-homepage-replacement-design.md .project/NOW.md README.md
git commit -m "docs: sync project status after stitched homepage replacement"
```

---

## Plan Self-Review

- **Spec coverage:** Covered homepage replacement scope, componentized implementation, hero validation + crawl navigation, non-home route preservation, build/test verification, and post-implementation documentation sync.
- **Placeholder scan:** No `TODO/TBD/implement later` placeholders remain; each task includes concrete files, commands, and expected outcomes.
- **Type consistency:** `HomeHero` uses `navigate({ to: '/crawl', search: { url } })` consistently with existing route search usage; route/component names remain consistent across tasks.
