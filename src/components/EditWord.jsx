import { useState } from 'react'
import { updateWord } from '../utils/words'

// AI 없이 사용자가 직접 단어 항목을 고치는 기능.
// 버튼(EditButton)과 실제 편집 폼(EditPanel)을 분리해서, 폼이 열렸을 때
// 아이콘 버튼들이 있는 좁은 가로줄 안이 아니라 카드 전체 너비를 쓰는 별도 영역에 그려지게 한다.
// (버튼과 폼을 한 컴포넌트가 같이 그리면 flex로 배치된 아이콘 행 안에 폼까지 끼어들어가
// 레이아웃이 깨지는 문제가 있었음)
export function EditButton({ active, onClick }) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'is-active' : ''}`}
      title="직접 수정"
      onClick={onClick}
    >
      ✏️
    </button>
  )
}

export function EditPanel({ uid, word, onClose, onSaved }) {
  const [form, setForm] = useState({
    word: word.word || '',
    reading: word.reading || '',
    meaning: word.meaning || '',
    example: word.example || '',
    exampleReading: word.exampleReading || '',
    exampleMeaning: word.exampleMeaning || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await updateWord(uid, word.id, form)
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="edit-word-box">
      <p className="edit-word-title">✏️ 직접 수정</p>
      <EditField label="단어" value={form.word} onChange={(v) => updateField('word', v)} />
      <EditField label="읽는법" value={form.reading} onChange={(v) => updateField('reading', v)} />
      <EditField label="뜻" value={form.meaning} onChange={(v) => updateField('meaning', v)} />
      <EditField label="예문" value={form.example} onChange={(v) => updateField('example', v)} />
      <EditField
        label="예문 읽는법"
        value={form.exampleReading}
        onChange={(v) => updateField('exampleReading', v)}
      />
      <EditField
        label="예문 뜻"
        value={form.exampleMeaning}
        onChange={(v) => updateField('exampleMeaning', v)}
      />
      {error && <p className="error">{error}</p>}
      <div className="ai-fix-actions">
        <button type="button" onClick={handleSave} disabled={saving || !form.word.trim()}>
          {saving ? '저장 중...' : '저장'}
        </button>
        <button type="button" className="ghost-btn" onClick={onClose} disabled={saving}>
          취소
        </button>
      </div>
    </div>
  )
}

function EditField({ label, value, onChange }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
