import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

// 단어 입력칸을 "메모장"처럼 쓸 수 있도록, 작성 중인 원문을 Firestore에 그대로 저장해둔다.
// 새로고침하거나 다른 기기에서 열어도 이어서 볼 수 있고, 단어를 생성해도 지워지지 않는다.
// processedLines: 지금까지 "단어장 업데이트"로 이미 Claude에 보낸 적 있는 줄들의 집합.
// 이걸 저장해두면, 다음에 업데이트를 누를 때 메모 전체가 아니라 새로 추가/수정된 줄만 보낼 수 있다.
function memoRef(uid) {
  return doc(db, 'users', uid, 'meta', 'memo')
}

export function subscribeMemo(uid, callback) {
  return onSnapshot(memoRef(uid), (snap) => {
    const data = snap.exists() ? snap.data() : {}
    callback({
      content: data.content || '',
      processedLines: data.processedLines || [],
    })
  })
}

export async function saveMemo(uid, content) {
  return setDoc(memoRef(uid), { content, updatedAt: Date.now() }, { merge: true })
}

export async function saveProcessedLines(uid, processedLines) {
  return setDoc(memoRef(uid), { processedLines }, { merge: true })
}

export async function clearMemo(uid) {
  return setDoc(
    memoRef(uid),
    { content: '', processedLines: [], updatedAt: Date.now() },
    { merge: true }
  )
}
