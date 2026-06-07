import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { MaterialIcon } from './home/MaterialIcon'
import { useLang } from '../lib/i18n'

const STORAGE_KEY = 'sitecrawler_landing_prompt_disabled'

export function LandingPrompt() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [visible, setVisible] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const navigatedRef = useRef(false)

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === '1') return
    setVisible(true)
  }, [])

  useEffect(() => {
    if (!visible) return

    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer)
          if (!navigatedRef.current) {
            navigatedRef.current = true
            navigate({ to: '/landing' })
          }
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [navigate, visible])

  function disablePrompt() {
    window.localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  function viewNow() {
    if (navigatedRef.current) return
    navigatedRef.current = true
    navigate({ to: '/landing' })
  }

  if (!visible) return null

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/35 px-4">
      <div className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
        <button
          type="button"
          aria-label={t('landing_prompt_close')}
          onClick={() => setVisible(false)}
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <MaterialIcon name="close" className="text-xl" />
        </button>
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <MaterialIcon name="account_tree" />
        </div>
        <p className="mb-2 text-lg font-semibold text-slate-950">{t('landing_prompt_title')}</p>
        <p className="mb-5 text-sm leading-6 text-slate-600">{t('landing_prompt_desc')}</p>
        <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {t('landing_prompt_countdown').replace('{seconds}', String(countdown))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={viewNow}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('landing_prompt_view')}
          </button>
          <button
            type="button"
            onClick={disablePrompt}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('landing_prompt_disable')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

