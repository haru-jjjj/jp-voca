import { useState } from 'react'
import { addWord, findDuplicate, updateWord } from '../utils/words'

export default function AddWords({ uid, existingWords }) {
  const [rawText, setRawText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null) // 파싱된 항목 미리보기
  const [saving, setSaving] = useState(false)
  const [saveDone, setSaveDone] = useState(0)

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
      setRawText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <h2>단어 입력 / Notion 붙여넣기</h2>
      <p className="hint">
        단어 하나만 입력해도 되고, Notion에서 정리해둔 여러 단어·문장을 그대로
        붙여넣어도 됩니다. &quot;단어장 업데이트&quot;를 누르면 자동으로
        읽는법·뜻·예문을 채워서 정리해줍니다.
      </p>
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder="예) 食べる&#10;또는 Notion에서 복사한 여러 줄의 텍스트"
        rows={8}
      />
      <button onClick={handleGenerate} disabled={loading || !rawText.trim()}>
        {loading ? '생성 중...' : '단어장 업데이트'}
      </button>
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
