import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
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
export const auth = getAuth(app)
export const db = getFirestore(app)
