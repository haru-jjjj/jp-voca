import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// 일본어/한글 웹폰트를 npm 패키지로 직접 번들에 포함시킨다(자체 호스팅).
// Google Fonts CDN 링크 방식은 모바일에서 한자 유니코드 구간(unicode-range)별로
// 여러 파일을 나눠서 불러오는데, 그중 일부만 로딩에 실패하면 같은 단어 안에서도
// 어떤 글자는 일본어 폰트로, 어떤 글자는 한국어 폰트로 렌더링되어 글자 모양이
// 뒤섞이는 문제(예: 部門 중 門만 다른 폰트로 나옴)가 생길 수 있다.
// 폰트 파일을 빌드에 직접 포함시키면 이 문제가 근본적으로 사라진다.
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/noto-sans-kr/400.css'
import '@fontsource/noto-sans-kr/500.css'
import '@fontsource/noto-sans-kr/700.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
