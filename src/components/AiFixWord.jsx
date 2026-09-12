import { useState } from 'react'
import { updateWord } from '../utils/words'

const FIELD_LABELS = [
  ['word', '단어'],
  ['reading', '읽는법'],
  ['meaning', '뜻'],
  ['example', '예문'],
  ['exampleReading', '예문 읽는법'],
  ['exampleMeaning', '예문 뜻'],
]

// 단어장/복습 화면 어디서든 붙여 쓸 수 있는, 단어 하나를 AI로 고치는 위젯.
// "뜻/읽는법이 틀렸다" 같은 걸 발견했을 때, 사용자가 메모를 적어 보내면
// Claude가 그 단어 항목만 다시 다듬어서 제안하고, 확인 후 저장한다.
export default function AiFixWord({ uid, word, onSaved }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState(null)

  function reset() {
    setOpen(false)
    setNote('')
    setError('')
    setProposal(null)
  }

  async function handleAsk() {
    if (!note.trim()) return
    setLoading(true)
    setError('')
    setProposal(null)
    try {
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          word: {
            word: word.word,
            reading: word.reading,
            meaning: word.meaning,
            example: word.example,
            exampleReading: word.exampleReading,
            exampleMeaning: word.exampleMeaning,
            tags: word.tags,
          },
          note,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const base = data.error || 'AI 수정 요청에 실패했습니다.'
        throw new Error(data.raw ? `${base}\n(응답 일부: ${data.raw.slice(0, 200)}...)` : base)
      }
      setProposal(data.entry)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleApply() {
    if (!proposal) return
    setSaving(true)
    setError('')
    try {
      const { word: w, reading, meaning, example, exampleReading, exampleMeaning, tags } = proposal
      await updateWord(uid, word.id, {
        word: w ?? word.word,
        reading: reading ?? word.reading,
        meaning: meaning ?? word.meaning,
        example: example ?? word.example,
        exampleReading: exampleReading ?? word.exampleReading,
        exampleMeaning: exampleMeaning ?? word.exampleMeaning,
        tags: Array.isArray(tags) ? tags : word.tags || [],
      })
      reset()
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="icon-btn"
        title="AI로 이 단어 수정"
        onClick={() => setOpen(true)}
      >
        🪄
      </button>
    )
  }

  const changedFields = proposal
    ? FIELD_LABELS.filter(([key]) => (proposal[key] || '') !== (word[key] || ''))
    : []

  return (
    <div className="ai-fix-box">
      <p className="ai-fix-title">🪄 AI로 이 단어 수정</p>
      <textarea
        className="ai-fix-note"
        placeholder="예) 읽는법이 틀렸어요. 실제로는 'おぼえる'가 아니라 다른 발음이에요 / 뜻을 좀 더 자세히 써주세요 등"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={loading || saving}
      />
      <div className="ai-fix-actions">
        <button
          type="button"
          onClick={handleAsk}
          disabled={loading || saving || !note.trim()}
        >
          {loading ? '확인 중...' : 'AI에게 확인 요청'}
        </button>
        <button type="button" className="ghost-btn" onClick={reset} disabled={loading || saving}>
          닫기
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {proposal && (
        <div className="ai-fix-proposal">
          {changedFields.length === 0 ? (
            <p className="hint">메모를 반영해도 달라지는 내용이 없어요.</p>
          ) : (
            <>
              <p className="hint">이렇게 바뀝니다 — 확인 후 적용해주세요.</p>
              {changedFields.map(([key, label]) => (
                <div className="ai-fix-diff-row" key={key}>
                  <span className="field-label">{label}</span>
                  <span className="ai-fix-old">{word[key] || '(없음)'}</span>
                  <span className="ai-fix-arrow">→</span>
                  <span className="ai-fix-new">{proposal[key] || '(없음)'}</span>
                </div>
              ))}
            </>
          )}
          <div className="ai-fix-actions">
            <button
              type="button"
              onClick={handleApply}
              disabled={saving || changedFields.length === 0}
            >
              {saving ? '적용 중...' : '이대로 적용'}
            </button>
            <button type="button" className="ghost-btn" onClick={() => setProposal(null)} disabled={saving}>
              다시 메모 쓰기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
