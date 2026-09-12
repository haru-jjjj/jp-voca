import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { initialSrs } from './srs'

function wordsCol(uid) {
  return collection(db, 'users', uid, 'words')
}

export function subscribeWords(uid, callback) {
  const q = query(wordsCol(uid))
  return onSnapshot(q, (snap) => {
    const list = []
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }))
    // 최신순 정렬 (createdAt 없을 수 있는 초기 저장 상태 대비)
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    callback(list)
  })
}

export async function addWord(uid, entry) {
  return addDoc(wordsCol(uid), {
    word: entry.word || '',
    reading: entry.reading || '',
    meaning: entry.meaning || '',
    example: entry.example || '',
    exampleReading: entry.exampleReading || '',
    exampleMeaning: entry.exampleMeaning || '',
    tags: entry.tags || [],
    // Claude가 읽는법 등에 확신이 없을 때 표시해두는 플래그. 단어장/복습 화면에서
    // "확인 필요" 배지로 보여줘서, 사용자가 직접 찾아봐야 할 항목을 눈에 띄게 한다.
    uncertain: !!entry.uncertain,
    note: entry.note || '',
    srs: initialSrs(),
    wrongStreak: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateWord(uid, id, patch) {
  const ref = doc(db, 'users', uid, 'words', id)
  return updateDoc(ref, { ...patch, updatedAt: serverTimestamp() })
}

export async function deleteWord(uid, id) {
  const ref = doc(db, 'users', uid, 'words', id)
  return deleteDoc(ref)
}

// 같은 word 문자열이 이미 있는지 확인 (대소문자/공백 무시)
export function findDuplicate(existingList, word) {
  const norm = (s) => (s || '').trim()
  return existingList.find((w) => norm(w.word) === norm(word))
}
