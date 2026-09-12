import { useEffect, useRef } from 'react'

// 아이콘 버튼: 카드의 다른 액션 버튼들(🔊 ✏️ 🪄 🗑)과 같은 자리에 놓는 용도.
export function HandwriteButton({ onClick }) {
  return (
    <button className="icon-btn" title="손글씨 연습" onClick={onClick}>
      ✍️
    </button>
  )
}

// 화면 전체를 반투명하게 덮는 손글씨 연습판.
// - 저장 기능 전혀 없음: 닫으면(또는 새로고침하면) 그냥 사라짐
// - 지우기 버튼으로 언제든 다시 쓸 수 있음
// - 마우스/손가락/애플펜슬(Pointer Events) 모두 지원
export default function HandwritePad({ onClose }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)

  // 캔버스를 화면 크기(+ 고해상도 디스플레이 대응)에 맞춘다.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function setup() {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#e0402a'
      ctx.lineWidth = 3.2
    }
    setup()
    window.addEventListener('resize', setup)
    return () => window.removeEventListener('resize', setup)
  }, [])

  // 연습판이 떠있는 동안은 뒤 배경이 스크롤되지 않게 막는다.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e) {
    e.preventDefault()
    drawingRef.current = true
    lastPointRef.current = getPos(e)
    canvasRef.current.setPointerCapture?.(e.pointerId)
  }

  function handlePointerMove(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    const last = lastPointRef.current
    if (last) {
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }
    lastPointRef.current = pos
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
  }

  return (
    <div className="handwrite-overlay">
      <div className="handwrite-toolbar">
        <button className="handwrite-btn" onClick={handleClear}>
          🧹 지우기
        </button>
        <button className="handwrite-btn is-close" onClick={onClose}>
          ✕ 닫기
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="handwrite-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  )
}
