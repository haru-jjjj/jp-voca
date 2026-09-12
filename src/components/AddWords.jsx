import { useEffect, useRef, useState } from 'react'
import { addWord, findDuplicate, updateWord } from '../utils/words'
import { subscribeMemo, saveMemo } from '../utils/memo'

const AUTOSAVE_DELAY = 700 // ms

export default function AddWords({ uid, existingWords }) {
  const [rawText, setRawText] = useState('')
  const [memoLoaded, setMemoLoaded] = useState(false)
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null) // 파싱된 항목 미리보기
  const [saving, setSaving] = useState(false)
  const [saveDone, setSaveDone] = useState(0)

  const saveTimer = useRef(null)
  const skipNextSave = useRef(false) // 서버에서 내려온 값으로 세팅할 때는 다시 저장하지 않기 위함

  // 메모 내용을 Firestore와 실시간 동기화 (최초 진입 시 한 번 불러오고, 이후엔 로컬 상태가 기준)
  useEffect(() => {
    const unsub = subscribeMemo(uid, (content) => {
      setRawText((prev) => {
        if (!memoLoaded) {
          skipNextSave.current = true
          return content
        }
        return prev
      })
      setMemoLoaded(true)
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  // 입력할 때마다 잠시 후 자동 저장 (메모장처럼 항상 남아 있도록)
  useEffect(() => {
    if (!memoLoaded) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await saveMemo(uid, rawText)
        setSaveState('saved')
      } catch {
        setSaveState('idle')
      }
    }, AUTOSAVE_DELAY)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawText, memoLoaded, uid])

  async function handleGenerate() {
    if (!rawText.trim()) return
    setLoading(true)
    setError('')
    setPreview(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '알 수 없는 오류')

      const entries = (data.entries || []).map((e) => {
        const dup = findDuplicate(existingWords, e.word)
        return {
          ...e,
          _dupId: dup ? dup.id : null,
          _include: true,
        }
      })
      setPreview(entries)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function updateEntry(idx, field, value) {
    setPreview((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e))
    )
  }

  function toggleInclude(idx) {
    setPreview((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, _include: !e._include } : e))
    )
  }

  async function handleSaveAll() {
    if (!preview) return
    setSaving(true)
    setSaveDone(0)
    try {
      for (const entry of preview) {
        if (!entry._include) continue
        const { _dupId, _include, ...clean } = entry
        if (_dupId) {
          await updateWord(uid, _dupId, clean)
        } else {
          await addWord(uid, clean)
        }
        setSaveDone((n) => n + 1)
      }
      setPreview(null)
      // 메모(원문)는 그대로 남겨둡니다 — 필요 없어진 부분만 직접 지우거나
      // 아래 "메모 전체 지우기" 버튼으로 한 번에 비울 수 있습니다.
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleClearMemo() {
    if (!confirm('메모 내용을 전부 지울까요? (이미 저장된 단어장에는 영향 없음)')) return
    setRawText('')
  }

  return (
    <div className="panel">
      <div className="memo-head">
        <div>
          <h2>단어 메모장</h2>
          <p className="hint">
            떠오르는 단어나 Notion에서 정리해둔 내용을 자유롭게 적어두는 공간입니다.
            내용은 자동 저장되며 새로고침하거나 나중에 다시 들어와도 그대로 남아 있습니다.
            준비가 되면 아래 &quot;단어장 업데이트&quot;를 눌러 정리하세요.
          </p>
        </div>
        <span className="save-indicator">
          {saveState === 'saving' && '저장 중...'}
          {saveState === 'saved' && '자동 저장됨'}
        </span>
      </div>

      <textarea
        className="memo-textarea"
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder="예) 食べる&#10;또는 Notion에서 복사한 여러 줄의 텍스트를 계속 이어서 적어두세요."
        spellCheck={false}
      />

      <div className="memo-actions">
        <button onClick={handleGenerate} disabled={loading || !rawText.trim()}>
          {loading ? '생성 중...' : '단어장 업데이트'}
        </button>
        <button className="ghost-btn" onClick={handleClearMemo} disabled={!rawText}>
          메모 전체 지우기
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {preview && (
        <div className="preview-list">
          <h3>미리보기 ({preview.length}개 항목)</h3>
          {preview.map((entry, idx) => (
            <div
              key={idx}
              className={`preview-card ${entry._dupId ? 'is-dup' : ''} ${
                !entry._include ? 'is-excluded' : ''
              }`}
            >
              <div className="preview-card-head">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={entry._include}
                    onChange={() => toggleInclude(idx)}
                  />
                  {entry._dupId ? '기존 단어 업데이트' : '새 단어 추가'}
                </label>
              </div>
              <Field
                label="단어"
                value={entry.word}
                onChange={(v) => updateEntry(idx, 'word', v)}
              />
              <Field
                label="읽는법"
                value={entry.reading}
                onChange={(v) => updateEntry(idx, 'reading', v)}
              />
              <Field
                label="뜻"
                value={entry.meaning}
                onChange={(v) => updateEntry(idx, 'meaning', v)}
              />
              <Field
                label="예문"
                value={entry.example}
                onChange={(v) => updateEntry(idx, 'example', v)}
              />
              <Field
                label="예문 읽는법"
                value={entry.exampleReading}
                onChange={(v) => updateEntry(idx, 'exampleReading', v)}
              />
              <Field
                label="예문 뜻"
                value={entry.exampleMeaning}
                onChange={(v) => updateEntry(idx, 'exampleMeaning', v)}
              />
            </div>
          ))}
          <button
            className="primary"
            onClick={handleSaveAll}
            disabled={saving || preview.every((e) => !e._include)}
          >
            {saving
              ? `저장 중... (${saveDone}/${preview.filter((e) => e._include).length})`
              : '단어장에 저장'}
          </button>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
