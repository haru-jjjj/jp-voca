import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

function statsRef(uid) {
  return doc(db, 'users', uid, 'meta', 'stats')
}

const defaultStats = { streak: 0, todayCount: 0, todayDate: '' }

export function subscribeStats(uid, callback) {
  return onSnapshot(statsRef(uid), (snap) => {
    callback(snap.exists() ? { ...defaultStats, ...snap.data() } : defaultStats)
  })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

// 복습 1건이 끝날 때마다 호출해서 오늘 복습 수 / 연속일수를 갱신한다.
export async function recordReview(uid, currentStats) {
  const today = todayStr()
  const stats = currentStats || defaultStats

  let { streak, todayCount, todayDate } = stats

  if (todayDate === today) {
    todayCount = (todayCount || 0) + 1
  } else {
    if (todayDate === yesterdayStr()) {
      streak = (streak || 0) + 1
    } else {
      streak = 1
    }
    todayDate = today
    todayCount = 1
  }

  await setDoc(statsRef(uid), { streak, todayCount, todayDate }, { merge: true })
}
