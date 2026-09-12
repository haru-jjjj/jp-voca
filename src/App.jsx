import { useEffect, useState } from 'react'
import { PERSONAL_ID } from './firebase'
import { subscribeWords } from './utils/words'
import { subscribeStats } from './utils/stats'
import AddWords from './components/AddWords'
import WordList from './components/WordList'
import Review from './components/Review'

const TABS = [
  { key: 'add', label: '단어 입력', icon: '✏️' },
  { key: 'list', label: '단어장', icon: '📖' },
  { key: 'review', label: '복습', icon: '🔁' },
]

export default function App() {
  const uid = PERSONAL_ID
  const [words, setWords] = useState([])
  const [stats, setStats] = useState({ streak: 0, todayCount: 0, todayDate: '' })
  const [tab, setTab] = useState('add')

  useEffect(() => {
    const unsubWords = subscribeWords(uid, setWords)
    const unsubStats = subscribeStats(uid, setStats)
    return () => {
      unsubWords()
      unsubStats()
    }
  }, [uid])

  const dueCount = words.filter(
    (w) => !w.srs || !w.srs.dueDate || w.srs.dueDate <= Date.now()
  ).length

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>日本語 단어장</h1>
        <div className="header-right">
          <span className="due-badge">{dueCount > 0 ? `복습 ${dueCount}` : '복습 완료'}</span>
        </div>
      </header>

      <nav className="tab-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
            {t.key === 'review' && dueCount > 0 && (
              <span className="tab-badge">{dueCount}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {tab === 'add' && <AddWords uid={uid} existingWords={words} />}
        {tab === 'list' && <WordList uid={uid} words={words} />}
        {tab === 'review' && <Review uid={uid} words={words} stats={stats} />}
      </main>
    </div>
  )
}
