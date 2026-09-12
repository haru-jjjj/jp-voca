import { useEffect, useRef, useState } from 'react'
import { addWord, findDuplicate, updateWord } from '../utils/words'
import {
  subscribeMemo,
  saveMemo,
  saveProcessedLines,
  savePendingPreview,
  clearMemo,
} from '../utils/memo'

const AUTOSAVE_DELAY = 700 // ms
const LINES_PER_BATCH = 10 // 한 번의 Claude 호출에 보낼 최대 줄 수 (응답 잘림 방지)

function getLines(text) {
  return text.split('\n').filter((l) => l.trim() !== '')
}

// 배치가 너무 길면 한 번에 다 보내지 않고 줄 단위로 나눠서 여러 번 호출한다.
function splitIntoBatches(lines, linesPerBatch) {
  const batches = []
  for (let i = 0; i < lines.length; i += linesPerBatch) {
    batches.push(lines.slice(i, i + linesPerBatch))
  }
  return batches
}

// entry 하나가 실제로 "끝났다"고 볼 수 있는지: 저장에 성공했거나, 사용자가 일부러 제외한 경우.
// 저장 시도 자체가 안 됐거나 실패한 항목은 여기 포함되지 않는다.
function isEntryResolved(entry) {
  return entry._saved === true || entry._include === false
}

// 같은 배치(batchIdx)에 속한 원본 줄들은, 그 배치의 모든 항목이 resolve(끝) 됐을 때만
// "처리 완료"로 간주한다. 하나라도 저장 실패/미완료면 그 배치의 원본 줄은 계속 "미완료"로 남겨서
// 다음 "단어장 업데이트" 때 다시 시도되게 한다 — 저장 안 됐는데 됐다고 착각하는 걸 막기 위함.
function computeResolvedBatchIdxs(preview) {
  const byBatch = new Map()
  for (const e of preview) {
    if (!byBatch.has(e._batchIdx)) byBatch.set(e._batchIdx, [])
    byBatch.get(e._batchIdx).push(e)
  }
  const resolved = []
  for (const [batchIdx, entries] of byBatch) {
    if (entries.every(isEntryResolved)) resolved.push(batchIdx)
  }
  return resolved
}

export default function AddWords({ uid, existingWords }) {
  const [rawText, setRawText] = useState('')
  const [processedLines, setProcessedLines] = useState([]) // 실제로 단어장 저장까지 끝난 줄들
  const [memoLoaded, setMemoLoaded] = useState(false)
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved'
  const [loading, setLoading] = useState(false)
  const [genProgress, setGenProgress] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null) // 파싱된 항목 미리보기 (아직 저장 안 됐거나 저장 중인 것 포함)
  const [previewBatches, setPreviewBatches] = useState([]) // batchIdx -> 원본 줄 배열
  const [saving, setSaving] = useState(false)
  const [saveDone, setSaveDone] = useState(0)
  const [restoredNotice, setRestoredNotice] = useState(false)

  const saveTimer = useRef(null)
  const skipNextSave = useRef(false) // 서버에서 내려온 값으로 세팅할 때는 다시 저장하지 않기 위함

  // 메모 내용을 Firestore와 실시간 동기화 (최초 진입 시 한 번 불러오고, 이후엔 로컬 상태가 기준)
  useEffect(() => {
    const unsub = subscribeMemo(uid, ({ content, processedLines: loaded, pendingPreview }) => {
      setRawText((prev) => {
        if (!memoLoaded) {
          skipNextSave.current = true
          return content
        }
        return prev
      })
      if (!memoLoaded) {
        setProcessedLines(loaded)
        // 지난번에 저장 전/저장 도중 끊긴 미리보기가 있으면 그대로 복원한다.
        // (없었던 일처럼 사라지면, 실제로는 저장 안 된 단어를 사용자가 저장됐다고 착각하게 된다.)
        if (pendingPreview && Array.isArray(pendingPreview.entries) && pendingPreview.entries.length > 0) {
          setPreview(pendingPreview.entries)
          setPreviewBatches((pendingPreview.batches || []).map((b) => b.lines || []))
          setRestoredNotice(true)
        }
      }
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

  // 미리보기를 편집(필드 수정/포함 체크 해제)할 때도 서버에 계속 반영해서,
  // 새로고침해도 편집 중이던 내용과 진행 상황을 그대로 이어갈 수 있게 한다.
  useEffect(() => {
    if (!memoLoaded) return
    if (saving) return // 저장 루프 안에서는 그때그때 직접 persist하므로 여기서 중복 저장하지 않음
    const timer = setTimeout(() => {
      if (preview && preview.length > 0) {
        savePendingPreview(uid, {
          entries: preview,
          batches: previewBatches.map((lines) => ({ lines })),
        }).catch(() => {})
      }
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, previewBatches, memoLoaded, saving, uid])

  // 저장이 진행 중일 때 실수로 새로고침/닫기를 하면 "끊긴 채로 저장됐다고 착각"하는
  // 상황이 생기기 쉬우므로, 브라우저 차원에서 한번 더 경고한다.
  useEffect(() => {
    if (!saving && !loading) return
    function handleBeforeUnload(e) {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saving, loading])

  async function handleGenerate() {
    const allLines = getLines(rawText)
    if (allLines.length === 0) return

    if (preview && preview.some((e) => !isEntryResolved(e))) {
      if (
        !confirm(
          '아직 단어장에 저장하지 않은 미리보기 항목이 있습니다. 계속하면 그 항목들은 사라집니다. 계속할까요?'
        )
      )
        return
    }

    const processedSet = new Set(processedLines)
    const newLines = allLines.filter((l) => !processedSet.has(l))

    if (newLines.length === 0) {
      setError(
        '새로 추가되거나 수정된 줄이 없습니다 — 이미 전부 단어장에 저장된 메모입니다. ' +
          '다시 분석하고 싶으면 아래 "전체 다시 분석"을 눌러주세요.'
      )
      return
    }

    setLoading(true)
    setError('')
    setPreview(null)
    setPreviewBatches([])
    setRestoredNotice(false)
    await savePendingPreview(uid, null).catch(() => {})

    const rawBatches = splitIntoBatches(newLines, LINES_PER_BATCH)
    const allEntries = []
    const succeededBatchLines = [] // succeededBatchLines[batchIdx] = 그 배치의 원본 줄들
    const failedMessages = []

    try {
      for (let i = 0; i < rawBatches.length; i++) {
        if (rawBatches.length > 1) {
          setGenProgress(`생성 중... (${i + 1}/${rawBatches.length})`)
        }
        try {
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ rawText: rawBatches[i].join('\n') }),
          })
          const data = await res.json()
          if (!res.ok) {
            const base =
              data.error || `알 수 없는 오류 (배치 ${i + 1}/${rawBatches.length})`
            const withDetail = data.raw
              ? `${base}\n(응답 일부: ${data.raw.slice(0, 200)}...)`
              : base
            throw new Error(withDetail)
          }
          const batchIdx = succeededBatchLines.length
          succeededBatchLines.push(rawBatches[i])
          for (const e of data.entries || []) {
            allEntries.push({ ...e, _batchIdx: batchIdx })
          }
        } catch (err) {
          // 이 배치만 건너뛴다 — 이 배치의 원본 줄은 processedLines에 들어가지 않으므로
          // 다음 "단어장 업데이트"에서 자동으로 다시 시도된다 (조용히 유실되지 않음).
          failedMessages.push(`배치 ${i + 1}/${rawBatches.length}: ${err.message}`)
        }
      }
    } finally {
      setLoading(false)
      setGenProgress('')
    }

    if (failedMessages.length > 0) {
      setError(failedMessages.join('\n\n'))
    }

    if (allEntries.length === 0) return

    const entries = allEntries.map((e) => {
      const dup = findDuplicate(existingWords, e.word)
      return {
        ...e,
        _dupId: dup ? dup.id : null,
        _include: true,
        _saved: false,
        _error: null,
      }
    })
    setPreview(entries)
    setPreviewBatches(succeededBatchLines)
    savePendingPreview(uid, {
      entries,
      batches: succeededBatchLines.map((lines) => ({ lines })),
    }).catch(() => {})
  }

  async function handleReanalyzeAll() {
    if (
      !confirm(
        '처리 기록을 초기화하고 메모 전체를 다시 분석 대상으로 만들까요? (메모 내용 자체는 지워지지 않습니다)'
      )
    )
      return
    setProcessedLines([])
    try {
      await saveProcessedLines(uid, [])
    } catch {
      // 무시 — 로컬 상태는 이미 갱신됨
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

  // 실제로 Firestore에 저장까지 성공한 항목만 processedLines에 반영한다.
  // 배치 단위로, 그 배치의 모든 항목이 저장/제외로 매듭지어졌을 때만 그 배치의 원본 줄을 "완료"로 표시한다.
  async function commitResolvedBatches(workingPreview, batches) {
    const resolvedBatchIdxs = computeResolvedBatchIdxs(workingPreview)
    if (resolvedBatchIdxs.length === 0) return workingPreview

    const resolvedLines = resolvedBatchIdxs.flatMap((bi) => batches[bi] || [])
    if (resolvedLines.length > 0) {
      setProcessedLines((prev) => {
        const updated = Array.from(new Set([...prev, ...resolvedLines]))
        saveProcessedLines(uid, updated).catch(() => {})
        return updated
      })
    }

    // 매듭지어진 배치의 항목은 미리보기에서 걷어낸다 (완료됐으니 더 이상 저장 대상이 아님).
    const remaining = workingPreview.filter((e) => !resolvedBatchIdxs.includes(e._batchIdx))
    return remaining
  }

  async function handleSaveAll() {
    if (!preview) return
    setSaving(true)
    setError('')

    let working = preview.map((e) => ({ ...e }))
    const initialDone = working.filter((e) => e._saved || !e._include).length
    setSaveDone(initialDone)
    let doneCount = initialDone

    const toSave = working.filter((e) => e._include && !e._saved)

    for (const target of toSave) {
      try {
        const { _dupId, _include, _batchIdx, _saved, _error, ...clean } = target
        let savedId = _dupId
        if (_dupId) {
          await updateWord(uid, _dupId, clean)
        } else {
          const ref = await addWord(uid, clean)
          savedId = ref.id
        }
        working = working.map((e) =>
          e === target ? { ...e, _saved: true, _error: null, _dupId: savedId } : e
        )
        doneCount += 1
        setSaveDone(doneCount)
      } catch (err) {
        working = working.map((e) => (e === target ? { ...e, _error: err.message } : e))
      }

      // 한 항목이 끝날 때마다 즉시 반영/저장한다.
      // 중간에 새로고침되더라도, 이미 저장된 항목은 다시 저장되지 않고(중복 방지),
      // 아직 저장 안 된 항목은 "저장 안 됨" 상태 그대로 정확히 복원된다.
      working = await commitResolvedBatches(working, previewBatches)
      setPreview(working)
      await savePendingPreview(
        uid,
        working.length > 0
          ? { entries: working, batches: previewBatches.map((lines) => ({ lines })) }
          : null
      ).catch(() => {})
    }

    setSaving(false)

    const stillFailed = working.filter((e) => e._include && !e._saved)
    if (stillFailed.length > 0) {
      setError(
        `${stillFailed.length}개 항목은 저장에 실패했습니다. 아래에서 오류 내용을 확인하고 "단어장에 저장"을 다시 눌러 재시도해주세요.`
      )
    } else if (working.length === 0) {
      setPreview(null)
      setPreviewBatches([])
    }
  }

  function handleClearMemo() {
    if (!confirm('메모 내용을 전부 지울까요? (이미 저장된 단어장에는 영향 없음)')) return
    setRawText('')
    setProcessedLines([])
    setPreview(null)
    setPreviewBatches([])
    clearMemo(uid).catch(() => {})
  }

  return (
    <div className="panel">
      <div className="memo-head">
        <div>
          <h2>단어 메모장</h2>
          <p className="hint">자동 저장 · 새로 추가한 줄만 분석해요</p>
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
        <button onClick={handleGenerate} disabled={loading || saving || !rawText.trim()}>
          {loading ? genProgress || '생성 중...' : '단어장 업데이트'}
        </button>
        <button className="ghost-btn" onClick={handleClearMemo} disabled={!rawText || saving}>
          메모 전체 지우기
        </button>
        <button
          className="ghost-btn"
          onClick={handleReanalyzeAll}
          disabled={loading || saving || processedLines.length === 0}
        >
          전체 다시 분석
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {preview && (
        <div className="preview-list">
          <h3>미리보기 ({preview.length}개 항목)</h3>
          {restoredNotice && (
            <p className="restored-notice">
              이전에 저장하지 못하고 남아있던 항목을 복원했어요. 확인 후 다시 저장해주세요.
            </p>
          )}
          {preview.map((entry, idx) => (
            <div
              key={idx}
              className={`preview-card ${entry._dupId ? 'is-dup' : ''} ${
                !entry._include ? 'is-excluded' : ''
              } ${entry._saved ? 'is-saved' : ''} ${entry._error ? 'has-error' : ''}`}
            >
              <div className="preview-card-head">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={entry._include}
                    disabled={entry._saved}
                    onChange={() => toggleInclude(idx)}
                  />
                  {entry._saved
                    ? '저장 완료'
                    : entry._dupId
                      ? '기존 단어 업데이트'
                      : '새 단어 추가'}
                </label>
              </div>
              {entry._error && (
                <p className="entry-error">저장 실패: {entry._error}</p>
              )}
              <Field
                label="단어"
                value={entry.word}
                disabled={entry._saved}
                onChange={(v) => updateEntry(idx, 'word', v)}
              />
              <Field
                label="읽는법"
                value={entry.reading}
                disabled={entry._saved}
                onChange={(v) => updateEntry(idx, 'reading', v)}
              />
              <Field
                label="뜻"
                value={entry.meaning}
                disabled={entry._saved}
                onChange={(v) => updateEntry(idx, 'meaning', v)}
              />
              <Field
                label="예문"
                value={entry.example}
                disabled={entry._saved}
                onChange={(v) => updateEntry(idx, 'example', v)}
              />
              <Field
                label="예문 읽는법"
                value={entry.exampleReading}
                disabled={entry._saved}
                onChange={(v) => updateEntry(idx, 'exampleReading', v)}
              />
              <Field
                label="예문 뜻"
                value={entry.exampleMeaning}
                disabled={entry._saved}
                onChange={(v) => updateEntry(idx, 'exampleMeaning', v)}
              />
            </div>
          ))}
          <button
            className="primary"
            onClick={handleSaveAll}
            disabled={saving || preview.every((e) => !e._include || e._saved)}
          >
            {saving
              ? `저장 중... (${saveDone}/${preview.filter((e) => e._include).length}) — 새로고침하지 마세요`
              : '단어장에 저장'}
          </button>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, disabled }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <input
        type="text"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
