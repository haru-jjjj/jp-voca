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
      // 아직 "단어장에 저장"까지 끝나지 않은 미리보기(생성은 됐지만 저장 전/저장 중 끊긴 것).
      // 새로고침해도 이 값으로 복원해서, 저장 안 된 항목을 조용히 잃어버리지 않도록 한다.
      pendingPreview: data.pendingPreview || null,
    })
  })
}

export async function saveMemo(uid, content) {
  return setDoc(memoRef(uid), { content, updatedAt: Date.now() }, { merge: true })
}

// processedLines는 "Claude에게 분석을 요청한 줄"이 아니라
// "실제로 단어장에 저장(추가/업데이트)까지 끝난 줄"만 넣어야 한다.
// 그래야 저장이 실패/중단돼도 그 줄은 계속 "아직 처리 안 됨" 상태로 남아
// 다음 "단어장 업데이트"에서 다시 시도된다 (저장 안 됐는데 됐다고 착각하는 것을 방지).
export async function saveProcessedLines(uid, processedLines) {
  return setDoc(memoRef(uid), { processedLines }, { merge: true })
}

// 저장 전/저장 도중인 미리보기 항목을 그대로 Firestore에 저장해둔다.
// null을 넘기면 (전부 저장 완료 등으로) 미리보기를 지운다.
export async function savePendingPreview(uid, pendingPreview) {
  return setDoc(memoRef(uid), { pendingPreview: pendingPreview || null }, { merge: true })
}

export async function clearMemo(uid) {
  return setDoc(
    memoRef(uid),
    { content: '', processedLines: [], pendingPreview: null, updatedAt: Date.now() },
    { merge: true }
  )
}
