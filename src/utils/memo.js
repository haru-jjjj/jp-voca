import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

// 단어 입력칸을 "메모장"처럼 쓸 수 있도록, 작성 중인 원문을 Firestore에 그대로 저장해둔다.
// 새로고침하거나 다른 기기에서 열어도 이어서 볼 수 있고, 단어를 생성해도 지워지지 않는다.
function memoRef(uid) {
  return doc(db, 'users', uid, 'meta', 'memo')
}

export function subscribeMemo(uid, callback) {
  return onSnapshot(memoRef(uid), (snap) => {
    callback(snap.exists() ? snap.data().content || '' : '')
  })
}

export async function saveMemo(uid, content) {
  return setDoc(memoRef(uid), { content, updatedAt: Date.now() }, { merge: true })
}
