import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
import { subscribeWords } from './utils/words'
import { subscribeStats } from './utils/stats'
import Auth from './components/Auth'
import AddWords from './components/AddWords'
import WordList from './components/WordList'
import Review from './components/Review'

const TABS = [
  { key: 'add', label: '단어 입력', icon: '✏️' },
  { key: 'list', label: '단어장', icon: '📖' },
  { key: 'review', label: '복습', icon: '🔁' },
]

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = 로딩 중
  const [words, setWords] = useState([])
  const [stats, setStats] = useState({ streak: 0, todayCount: 0, todayDate: '' })
  const [tab, setTab] = useState('add')

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  useEffect(() => {
    if (!user) return
    const unsubWords = subscribeWords(user.uid, setWords)
    const unsubStats = subscribeStats(user.uid, setStats)
    return () => {
      unsubWords()
      unsubStats()
    }
  }, [user])

  if (user === undefined) {
    return <div className="loading-screen">불러오는 중...</div>
  }

  if (!user) {
    return <Auth />
  }

  const dueCount = words.filter(
    (w) => !w.srs || !w.srs.dueDate || w.srs.dueDate <= Date.now()
  ).length

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>日本語 단어장</h1>
        <div className="header-right">
          <span className="due-badge">{dueCount > 0 ? `복습 ${dueCount}` : '복습 완료'}</span>
          <button className="link-btn" onClick={() => signOut(auth)}>
            로그아웃
          </button>
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
        {tab === 'add' && <AddWords uid={user.uid} existingWords={words} />}
        {tab === 'list' && <WordList uid={user.uid} words={words} />}
        {tab === 'review' && (
          <Review uid={user.uid} words={words} stats={stats} />
        )}
      </main>
    </div>
  )
}
