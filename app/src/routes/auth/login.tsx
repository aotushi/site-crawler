import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useLang } from '../../lib/i18n'
import { fetchWorker } from '../../lib/api'
import { setToken } from '../../lib/auth'

function LoginPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetchWorker('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) {
      const { token } = await res.json() as { token: string }
      setToken(token)
      navigate({ to: '/' })
    } else {
      const { error: msg } = await res.json() as { error: string }
      setError(msg)
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-20 px-4">
      <h1 className="text-2xl font-bold mb-6">{t('login_title')}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">{t('login_email')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2" required />
        </div>
        <div>
          <label className="block text-sm mb-1">{t('login_password')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2" required />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          {t('login_submit')}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-500">
        {t('login_no_account')} <Link to="/auth/register" className="text-blue-600">{t('nav_register')}</Link>
      </p>
    </div>
  )
}

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
})
