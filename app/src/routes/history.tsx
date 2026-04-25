import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useLang } from '../lib/i18n'
import { fetchWorker } from '../lib/api'
import { getToken } from '../lib/auth'

interface CrawlRecord {
  id: string
  user_id: string
  url: string
  status: 'running' | 'done' | 'failed'
  file_count: number | null
  zip_size: number | null
  created_at: number
  completed_at: number | null
}

function formatBytes(b: number) {
  if (!b) return '-'
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function HistoryPage() {
  const { t } = useLang()
  const [records, setRecords] = useState<CrawlRecord[]>([])

  useEffect(() => {
    fetchWorker('/api/history')
      .then(r => r.json() as Promise<CrawlRecord[]>)
      .then(setRecords)
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('history_title')}</h1>
      {records.length === 0 ? (
        <p className="text-gray-400">{t('history_empty')}</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">{t('history_url')}</th>
              <th className="py-2 pr-4">{t('history_status')}</th>
              <th className="py-2 pr-4">{t('history_files')}</th>
              <th className="py-2 pr-4">{t('history_size')}</th>
              <th className="py-2">{t('history_time')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-4 max-w-xs truncate text-blue-600">{r.url}</td>
                <td className="py-2 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.status === 'done' ? 'bg-green-100 text-green-700' :
                    r.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{r.status}</span>
                </td>
                <td className="py-2 pr-4 text-gray-600">{r.file_count ?? '-'}</td>
                <td className="py-2 pr-4 text-gray-600">{formatBytes(r.zip_size ?? 0)}</td>
                <td className="py-2 text-gray-400">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export const Route = createFileRoute('/history')({
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: '/auth/login' })
  },
  component: HistoryPage,
})
