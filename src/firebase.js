import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// 사용자가 제공한 Firebase 프로젝트 설정
const firebaseConfig = {
  apiKey: 'AIzaSyB0to1ngjUdiq-nO-VP9XAxvIRwW2smVLE',
  authDomain: 'study-65680.firebaseapp.com',
  projectId: 'study-65680',
  storageBucket: 'study-65680.firebasestorage.app',
  messagingSenderId: '973612375260',
  appId: '1:973612375260:web:a80d52fa0e25dc91692819',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// 로그인 없이 혼자 쓰는 앱이라, Firestore 경로를 고정된 하나의 ID로 사용한다.
// (firestore.rules에서도 이 값과 정확히 일치하는 경로만 열어둔다)
export const PERSONAL_ID = 'ckm-personal'
