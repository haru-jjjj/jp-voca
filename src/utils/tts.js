// 브라우저 내장 SpeechSynthesis API를 이용한 무료 일본어 TTS
let cachedJaVoice = null

function pickJapaneseVoice() {
  if (cachedJaVoice) return cachedJaVoice
  const voices = window.speechSynthesis?.getVoices?.() || []
  cachedJaVoice =
    voices.find((v) => v.lang?.toLowerCase().startsWith('ja')) || null
  return cachedJaVoice
}

// 음성 목록은 비동기로 로드되는 브라우저가 많아 한 번 이벤트를 걸어둔다.
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedJaVoice = null
  }
}

export function speakJapanese(text) {
  if (!text) return
  if (!('speechSynthesis' in window)) {
    console.warn('이 브라우저는 음성 재생을 지원하지 않습니다.')
    return
  }
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'ja-JP'
  const voice = pickJapaneseVoice()
  if (voice) utter.voice = voice
  utter.rate = 0.95
  window.speechSynthesis.speak(utter)
}
