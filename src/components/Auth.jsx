import { useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '../firebase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        await createUserWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      setError(errorMessage(err.code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>日本語 단어장</h1>
        <p className="auth-sub">
          {mode === 'login' ? '로그인' : '계정 만들기'}
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? '처리 중...' : mode === 'login' ? '로그인' : '계정 만들기'}
          </button>
        </form>
        <button
          className="link-btn"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError('')
          }}
        >
          {mode === 'login'
            ? '계정이 없나요? 새로 만들기'
            : '이미 계정이 있나요? 로그인'}
        </button>
      </div>
    </div>
  )
}

function errorMessage(code) {
  const map = {
    'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
    'auth/user-not-found': '존재하지 않는 계정입니다.',
    'auth/wrong-password': '비밀번호가 일치하지 않습니다.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 일치하지 않습니다.',
    'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
  }
  return map[code] || '오류가 발생했습니다. 다시 시도해주세요.'
}
