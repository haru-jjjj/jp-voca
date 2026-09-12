import { useMemo, useState } from 'react'
import { deleteWord } from '../utils/words'
import { speakJapanese } from '../utils/tts'
import AiFixWord from './AiFixWord'
import EditWord from './EditWord'

export default function WordList({ uid, words }) {
  const [search, setSearch] = useState('')

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
              </div>
              <div className="word-actions">
                <button
                  className="icon-btn"
                  title="발음 듣기"
                  onClick={() => speakJapanese(w.word)}
                >
                  🔊
                </button>
                <EditWord uid={uid} word={w} />
                <AiFixWord uid={uid} word={w} />
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
    </div>
  )
}
