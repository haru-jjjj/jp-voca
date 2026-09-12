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
// 한 번의 "단어장 업데이트" 클릭에서 처리할 최대 줄 수.
// 이 제한이 없으면 메모에 새 내용이 잔뜩 쌓여있을 때 수백 개짜리 미리보기가 한 번에 생겨서
// (카드 하나당 입력창 6개 × 수백 개 = DOM이 수천 개) 폰 브라우저가 버벅이다 멈추는 문제가 있었다.
// 남은 줄이 있으면 안내 메시지를 보여주고, 사용자가 "단어장 업데이트"를 다시 눌러 이어서 처리하게 한다.
const MAX_NEW_LINES_PER_RUN = 30

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

// 미리보기 카드 하나당 입력창 6개가 그려지므로, 항목이 너무 많으면 화면(특히 모바일)이
// 감당 못 하고 멈춰버릴 수 있다. 배치 단위로 앞에서부터 maxEntries개 정도까지만 남기고
// 나머지는 잘라낸다 — 잘려나간 배치의 원본 줄은 처리 완료로 표시되지 않으므로 유실되지 않고,
// 다음 "단어장 업데이트"에서 자동으로 이어서 처리된다.
function capEntriesForSafety(entries, maxEntries) {
  const batchIdxs = [...new Set(entries.map((e) => e._batchIdx))].sort((a, b) => a - b)
  const kept = []
  let count = 0
  for (const bi of batchIdxs) {
    const batchEntries = entries.filter((e) => e._batchIdx === bi)
    if (count > 0 && count + batchEntries.length > maxEntries) break
    kept.push(...batchEntries)
    count += batchEntries.length
  }
  return { kept, droppedCount: entries.length - kept.length }
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
  const [infoMsg, setInfoMsg] = useState('')

  const saveTimer = useRef(null)
  const skipNextSave = useRef(false) // 서버에서 내려온 값으로 세팅할 때는 다시 저장하지 않기 위함
  // Firestore의 onSnapshot은 "최초 로딩"뿐 아니라, 우리가 직접 쓴 내용이 반영될 때도
  // (로컬 캐시 즉시 반영 + 서버 확인) 매번 다시 호출된다. 최초 진입 시 딱 한 번만 서버 내용으로
  // 화면을 채우고, 그 이후에는 지금 입력 중인 로컬 내용을 그대로 신뢰해야 한다.
  // 이 판단을 React state(memoLoaded)로 하면, 아래 구독 useEffect는 [uid]에만 의존해서
  // 마운트 시 딱 한 번만 실행되므로 콜백 안에서 참조하는 state는 항상 마운트 시점(false)의
  // 오래된 값으로 고정되는 "stale closure" 문제가 생긴다 — 그러면 자동저장 왕복 응답이 올
  // 때마다 매번 "아직 최초 로딩 전"으로 잘못 판단해서, 방금 입력 중이던 내용을 서버의
  // (그보다 약간 더 오래된) 내용으로 계속 덮어써버려 타이핑 중간이 잘려나가는 데이터 유실이
  // 발생했다. ref는 클로저와 무관하게 항상 최신값을 참조하므로 이 문제가 없다.
  const firstSnapshotHandledRef = useRef(false)
  // 문서 로딩이 끝나기 전에 사용자가 이미 타이핑을 시작했다면, 그 이후 서버 내용이 도착해도
  // 사용자가 입력한 내용을 덮어쓰지 않는다(로딩 중 입력이 통째로 날아가는 것을 방지).
  const userEditedRef = useRef(false)
  // 디바운스 타이머가 아직 안 끝난 최신 rawText를 참조하기 위한 ref (아래 flush에서 사용).
  const rawTextRef = useRef('')
  useEffect(() => {
    rawTextRef.current = rawText
  }, [rawText])

  // 메모 내용을 Firestore와 실시간 동기화 (최초 진입 시 한 번만 불러오고, 이후엔 로컬 상태가 기준)
  useEffect(() => {
    firstSnapshotHandledRef.current = false
    const unsub = subscribeMemo(uid, ({ content, processedLines: loaded, pendingPreview }) => {
      if (firstSnapshotHandledRef.current) return
      firstSnapshotHandledRef.current = true

      if (!userEditedRef.current) {
        skipNextSave.current = true
        setRawText(content)
      }
      setProcessedLines(loaded)
      // 지난번에 저장 전/저장 도중 끊긴 미리보기가 있으면 그대로 복원한다.
      // (없었던 일처럼 사라지면, 실제로는 저장 안 된 단어를 사용자가 저장됐다고 착각하게 된다.)
      // 단, 예전 버전에서 생긴 수백 개짜리 미리보기가 남아있을 수도 있으므로
      // 복원할 때도 안전한 개수로 잘라서, 열자마자 화면이 멈추는 일이 없게 한다.
      if (pendingPreview && Array.isArray(pendingPreview.entries) && pendingPreview.entries.length > 0) {
        const batchesLines = (pendingPreview.batches || []).map((b) => b.lines || [])
        const { kept, droppedCount } = capEntriesForSafety(
          pendingPreview.entries,
          MAX_NEW_LINES_PER_RUN
        )
        setPreview(kept)
        setPreviewBatches(batchesLines)
        setRestoredNotice(true)
        if (droppedCount > 0) {
          setInfoMsg(
            `이전 미리보기가 너무 많아(${pendingPreview.entries.length}개) 일부만 복원했습니다. ` +
              `나머지 ${droppedCount}개는 메모에 그대로 남아있으니 "단어장 업데이트"를 다시 눌러 이어서 처리해주세요.`
          )
          // 잘라낸 나머지는 그대로 저장해두지 않는다 — 다음에 열 때마다 또 잘려나가는 게 아니라
          // 남은 항목을 정상적인 "단어장 업데이트" 흐름(캡 적용됨)으로 다시 생성하게 한다.
          savePendingPreview(uid, { entries: kept, batches: pendingPreview.batches || [] }).catch(
            () => {}
          )
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

  // 모바일에서는 다른 앱으로 전환하거나 탭을 벗어나는 순간 700ms 디바운스 타이머가
  // 아직 끝나기 전에 브라우저/앱이 그대로 종료되는 경우가 있다 — 이러면 마지막으로
  // 입력한 몇 글자(또는 붙여넣은 내용 일부)가 자동저장되지 못한 채 그냥 유실된다.
  // 화면이 안 보이게 되는 시점(visibilitychange)과 페이지가 실제로 닫히는 시점(pagehide)
  // 모두에서 디바운스를 기다리지 않고 즉시 저장을 시도해서 이 창을 최대한 줄인다.
  useEffect(() => {
    function flush() {
      if (!memoLoaded) return
      clearTimeout(saveTimer.current)
      saveMemo(uid, rawTextRef.current).catch(() => {})
    }
    function handleVisibilityChange() {
      if (document.hidden) flush()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', flush)
    }
  }, [uid, memoLoaded])

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
    const allNewLines = allLines.filter((l) => !processedSet.has(l))

    if (allNewLines.length === 0) {
      setError(
        '새로 추가되거나 수정된 줄이 없습니다 — 이미 전부 단어장에 저장된 메모입니다. ' +
          '다시 분석하고 싶으면 아래 "전체 다시 분석"을 눌러주세요.'
      )
      return
    }

    // 한 번에 너무 많은 줄을 처리하면 미리보기 카드가 넘쳐나 화면이 멈출 수 있으므로 잘라서 처리한다.
    const newLines = allNewLines.slice(0, MAX_NEW_LINES_PER_RUN)
    const remainingAfterThisRun = allNewLines.length - newLines.length

    setLoading(true)
    setError('')
    setInfoMsg('')
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

    const entriesRaw = allEntries.map((e) => {
      const dup = findDuplicate(existingWords, e.word)
      return {
        ...e,
        _dupId: dup ? dup.id : null,
        _include: true,
        _saved: false,
        _error: null,
      }
    })
    // 방어적으로 한 번 더 캡을 건다 (배치 하나가 예상보다 많은 항목을 반환하는 경우 대비).
    const { kept: entries, droppedCount: extraDropped } = capEntriesForSafety(
      entriesRaw,
      MAX_NEW_LINES_PER_RUN
    )
    setPreview(entries)
    setPreviewBatches(succeededBatchLines)
    savePendingPreview(uid, {
      entries,
      batches: succeededBatchLines.map((lines) => ({ lines })),
    }).catch(() => {})

    const totalRemaining = remainingAfterThisRun + extraDropped
    if (totalRemaining > 0) {
      setInfoMsg(
        `이번에는 ${entries.length}개만 처리했어요. 아직 처리하지 않은 줄이 ${totalRemaining}개 더 있어요 — ` +
          '지금 항목을 저장한 뒤 "단어장 업데이트"를 다시 눌러 이어서 처리해주세요.'
      )
    }
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

  // 미리보기가 너무 커져서 화면이 버벅이거나, 더 이상 필요 없을 때 메모 내용은 그대로 두고
  // 미리보기만 안전하게 비운다. 아직 저장 안 된 항목의 원본 줄은 처리 완료 표시가 안 돼 있으므로
  // 나중에 "단어장 업데이트"를 다시 누르면 정상적으로(캡 적용된 채로) 다시 처리된다.
  function handleDiscardPreview() {
    if (!confirm('미리보기를 비울까요? (아직 저장 안 된 항목은 메모에 남아 다음에 다시 처리됩니다)'))
      return
    setPreview(null)
    setPreviewBatches([])
    setRestoredNotice(false)
    setInfoMsg('')
    savePendingPreview(uid, null).catch(() => {})
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
          <p className="hint">
            자동 저장 · 새로 추가한 줄만 분석해요 · 읽는법/상황을 같이 적어두면 더 정확해져요
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
        onChange={(e) => {
          userEditedRef.current = true
          setRawText(e.target.value)
        }}
        placeholder={
          '예) 食べる\n' +
          '諦める（あきらめる）- 드라마에서 들음\n' +
          '또는 Notion에서 복사한 여러 줄의 텍스트를 계속 이어서 적어두세요.\n' +
          '읽는법이나 들은 상황을 같이 적어두면 AI가 더 정확하게 채워줘요.'
        }
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
      {infoMsg && <p className="restored-notice">{infoMsg}</p>}

      {preview && (
        <div className="preview-list">
          <div className="preview-list-head">
            <h3>미리보기 ({preview.length}개 항목)</h3>
            <button
              type="button"
              className="link-btn"
              onClick={handleDiscardPreview}
              disabled={saving}
            >
              미리보기 취소
            </button>
          </div>
          {restoredNotice && (
            <p className="restored-notice">
              이전에 저장하지 못하고 남아있던 항목을 복원했어요. 확인 후 다시 저장해주세요.
            </p>
          )}
          {preview.map((entry, idx) =>
            entry._saved ? (
              // 이미 저장된 항목은 입력창을 다시 그리지 않고 한 줄 요약만 보여준다.
              // (항목이 많을 때 매번 전체를 다시 그리면 화면이 버벅이는 걸 줄이기 위함)
              <div key={idx} className="preview-card is-saved is-compact">
                <span>✅ {entry.word}</span>
                <span className="hint">저장 완료</span>
              </div>
            ) : (
              <div
                key={idx}
                className={`preview-card ${entry._dupId ? 'is-dup' : ''} ${
                  !entry._include ? 'is-excluded' : ''
                } ${entry._error ? 'has-error' : ''}`}
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
                  {entry.uncertain && <span className="uncertain-badge">⚠️ 확인 필요</span>}
                </div>
                {entry.uncertain && entry.note && (
                  <p className="uncertain-note">⚠️ {entry.note}</p>
                )}
                {entry._error && <p className="entry-error">저장 실패: {entry._error}</p>}
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
            )
          )}
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
