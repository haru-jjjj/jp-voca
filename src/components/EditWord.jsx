import { useState } from 'react'
import { updateWord } from '../utils/words'

// AI 없이 사용자가 직접 단어 항목을 고칠 수 있는 위젯. AiFixWord(🪄, AI에게 요청)와 짝을 이루는
// 수동 수정 버전 — 입력한 내용이 그대로, 추가 확인 없이 바로 저장된다.
export default function EditWord({ uid, word, onSaved }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleOpen() {
    setForm({
      word: word.word || '',
      reading: word.reading || '',
      meaning: word.meaning || '',
      example: word.example || '',
      exampleReading: word.exampleReading || '',
      exampleMeaning: word.exampleMeaning || '',
    })
    setError('')
    setOpen(true)
  }

  function handleCancel() {
    setOpen(false)
    setForm(null)
    setError('')
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      await updateWord(uid, word.id, form)
      setOpen(false)
      setForm(null)
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="icon-btn" title="직접 수정" onClick={handleOpen}>
        ✏️
      </button>
    )
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
        <button type="button" className="ghost-btn" onClick={handleCancel} disabled={saving}>
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
