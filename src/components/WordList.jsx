import { useMemo, useState } from 'react'
import { deleteWord } from '../utils/words'
import { speakJapanese } from '../utils/tts'
import { AiFixButton, AiFixPanel } from './AiFixWord'
import { EditButton, EditPanel } from './EditWord'
import HandwritePad, { HandwriteButton } from './HandwritePad'

export default function WordList({ uid, words }) {
  const [search, setSearch] = useState('')
  // 카드별로 어떤 수정 패널이 열려있는지: { [단어id]: 'edit' | 'ai' | undefined }
  const [openPanel, setOpenPanel] = useState({})
  // 손글씨 연습판을 지금 열어둔 단어 id (한 번에 하나만)
  const [handwriteId, setHandwriteId] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return words
    return words.filter((w) =>
      [w.word, w.reading, w.meaning, w.example]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [words, search])

  async function handleDelete(id) {
    if (!confirm('이 단어를 삭제할까요?')) return
    await deleteWord(uid, id)
  }

  function togglePanel(id, panel) {
    setOpenPanel((prev) => ({ ...prev, [id]: prev[id] === panel ? null : panel }))
  }

  function closePanel(id) {
    setOpenPanel((prev) => ({ ...prev, [id]: null }))
  }

  return (
    <div className="panel">
      <h2>단어장 ({words.length}개)</h2>
      <input
        className="search-input"
        placeholder="검색 (단어, 뜻, 예문...)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="word-grid">
        {filtered.map((w) => (
          <div className="word-card" key={w.id}>
            <div className="word-card-top">
              <div>
                <span className="word-main">{w.word}</span>
                <span className="word-reading">（{w.reading}）</span>
                {w.uncertain && (
                  <span className="uncertain-badge" title={w.note || '확신이 낮은 항목이에요'}>
                    ⚠️ 확인 필요
                  </span>
                )}
              </div>
              <div className="word-actions">
                <button
                  className="icon-btn"
                  title="발음 듣기"
                  onClick={() => speakJapanese(w.word)}
                >
                  🔊
                </button>
                <EditButton
                  active={openPanel[w.id] === 'edit'}
                  onClick={() => togglePanel(w.id, 'edit')}
                />
                <AiFixButton
                  active={openPanel[w.id] === 'ai'}
                  onClick={() => togglePanel(w.id, 'ai')}
                />
                <HandwriteButton onClick={() => setHandwriteId(w.id)} />
                <button
                  className="icon-btn danger"
                  title="삭제"
                  onClick={() => handleDelete(w.id)}
                >
                  🗑
                </button>
              </div>
            </div>
            <p className="word-meaning">{w.meaning}</p>
            {w.uncertain && w.note && <p className="uncertain-note">⚠️ {w.note}</p>}
            {w.example && (
              <div className="word-example">
                <div className="example-jp">
                  <span>{w.example}</span>
                  <button
                    className="icon-btn small"
                    title="예문 듣기"
                    onClick={() => speakJapanese(w.example)}
                  >
                    🔊
                  </button>
                </div>
                <p className="example-reading">{w.exampleReading}</p>
                <p className="example-meaning">{w.exampleMeaning}</p>
              </div>
            )}
            {/* 수정 패널은 아이콘 줄과 분리된, 카드 전체 너비를 쓰는 영역에 그린다 */}
            {openPanel[w.id] === 'edit' && (
              <EditPanel
                uid={uid}
                word={w}
                onClose={() => closePanel(w.id)}
                onSaved={() => closePanel(w.id)}
              />
            )}
            {openPanel[w.id] === 'ai' && (
              <AiFixPanel
                uid={uid}
                word={w}
                onClose={() => closePanel(w.id)}
                onSaved={() => closePanel(w.id)}
              />
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="empty-msg">
            {words.length === 0
              ? '아직 등록된 단어가 없습니다. 단어 입력 탭에서 추가해보세요.'
              : '검색 결과가 없습니다.'}
          </p>
        )}
      </div>
      {handwriteId && <HandwritePad onClose={() => setHandwriteId(null)} />}
    </div>
  )
}
