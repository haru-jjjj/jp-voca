import { useMemo, useState } from 'react'
import { updateWord } from '../utils/words'
import { nextSrs, isDue } from '../utils/srs'
import { recordReview } from '../utils/stats'
import { speakJapanese } from '../utils/tts'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Review({ uid, words, stats }) {
  const dueWords = useMemo(
    () => words.filter((w) => isDue(w.srs)),
    [words]
  )
  const [queue, setQueue] = useState(() => shuffle(dueWords))
  const [flipped, setFlipped] = useState(false)
  const [sessionCount, setSessionCount] = useState(0)

  function restart() {
    setQueue(shuffle(words.filter((w) => isDue(w.srs))))
    setFlipped(false)
    setSessionCount(0)
  }

  const current = queue[0]

  async function handleAnswer(quality) {
    if (!current) return
    const newSrs = nextSrs(current.srs, quality)
    const wrongStreak =
      quality === 'again' ? (current.wrongStreak || 0) + 1 : 0

    await updateWord(uid, current.id, { srs: newSrs, wrongStreak })
    await recordReview(uid, stats)
    setSessionCount((n) => n + 1)
    setFlipped(false)

    setQueue((prev) => {
      const rest = prev.slice(1)
      if (quality === 'again') {
        // 같은 세션 안에서 다시 등장하도록 뒤쪽에 재배치
        const pos = Math.min(rest.length, 2 + Math.floor(Math.random() * 3))
        const copy = [...rest]
        copy.splice(pos, 0, current)
        return copy
      }
      return rest
    })
  }

  const wrongWords = words.filter((w) => (w.wrongStreak || 0) >= 2)

  return (
    <div className="panel">
      <h2>복습 퀴즈</h2>
      <div className="review-stats">
        <span>🔥 연속 {stats?.streak || 0}일</span>
        <span>오늘 {stats?.todayDate === todayStr() ? stats.todayCount : 0}개 복습</span>
        <span>이번 세션 {sessionCount}개</span>
        <button className="link-btn" onClick={restart}>
          큐 새로고침
        </button>
      </div>

      {!current && (
        <div className="review-empty">
          <p>🎉 오늘 복습할 단어가 없습니다!</p>
          <p className="hint">
            새 단어를 추가하거나, 아래 &quot;헷갈리는 단어&quot;를 다시 훑어보세요.
          </p>
        </div>
      )}

      {current && (
        <div className="flashcard-wrap">
          <p className="queue-count">남은 카드: {queue.length}</p>
          <div
            className={`flashcard ${flipped ? 'flipped' : ''}`}
            onClick={() => setFlipped((f) => !f)}
          >
            <div className="flashcard-front">
              <span className="flash-word">{current.word}</span>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  speakJapanese(current.word)
                }}
              >
                🔊
              </button>
              {current.example && (
                <div className="flash-example-front">
                  <span>{current.example}</span>
                  <button
                    className="icon-btn small"
                    onClick={(e) => {
                      e.stopPropagation()
                      speakJapanese(current.example)
                    }}
                  >
                    🔊
                  </button>
                </div>
              )}
              <p className="flash-hint">탭해서 답 보기</p>
            </div>
            <div className="flashcard-back">
              <p className="flash-reading">{current.reading}</p>
              <p className="flash-meaning">{current.meaning}</p>
              {current.example && (
                <div className="flash-example">
                  <p>{current.example}</p>
                  <p className="example-reading">{current.exampleReading}</p>
                  <p className="example-meaning">{current.exampleMeaning}</p>
                </div>
              )}
            </div>
          </div>

          {flipped && (
            <div className="answer-buttons">
              <button className="ans-again" onClick={() => handleAnswer('again')}>
                다시 (몰랐음)
              </button>
              <button className="ans-hard" onClick={() => handleAnswer('hard')}>
                어려움
              </button>
              <button className="ans-good" onClick={() => handleAnswer('good')}>
                보통
              </button>
              <button className="ans-easy" onClick={() => handleAnswer('easy')}>
                쉬움
              </button>
            </div>
          )}
        </div>
      )}

      {wrongWords.length > 0 && (
        <div className="wrong-words">
          <h3>헷갈리는 단어 ({wrongWords.length})</h3>
          <div className="word-grid">
            {wrongWords.map((w) => (
              <div className="word-card" key={w.id}>
                <div className="word-card-top">
                  <div>
                    <span className="word-main">{w.word}</span>
                    <span className="word-reading">（{w.reading}）</span>
                  </div>
                  <button className="icon-btn" onClick={() => speakJapanese(w.word)}>
                    🔊
                  </button>
                </div>
                <p className="word-meaning">{w.meaning}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
