// 아주 단순화된 SM-2 (Anki 계열) 간격 반복 알고리즘
// quality: 0(전혀 몰랐음) ~ 3(완벽하게 기억함) 중 하나로 입력받는다.

export function initialSrs() {
  return {
    interval: 0, // 일 단위
    easeFactor: 2.5,
    repetitions: 0,
    dueDate: Date.now(),
  }
}

// quality: 'again' | 'hard' | 'good' | 'easy'
export function nextSrs(srs, quality) {
  let { interval, easeFactor, repetitions } = srs || initialSrs()
  easeFactor = easeFactor ?? 2.5
  interval = interval ?? 0
  repetitions = repetitions ?? 0

  if (quality === 'again') {
    repetitions = 0
    interval = 0 // 오늘 안에(같은 세션 내) 다시 등장
    easeFactor = Math.max(1.3, easeFactor - 0.2)
  } else {
    const qMap = { hard: 3, good: 4, easy: 5 }
    const q = qMap[quality] ?? 4

    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = quality === 'hard' ? 3 : 6
    } else {
      interval = Math.round(interval * easeFactor)
    }

    repetitions += 1
    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    )

    if (quality === 'hard') interval = Math.max(1, Math.round(interval * 0.7))
    if (quality === 'easy') interval = Math.round(interval * 1.3)
  }

  const dueDate = Date.now() + interval * 24 * 60 * 60 * 1000

  return { interval, easeFactor, repetitions, dueDate }
}

export function isDue(srs) {
  if (!srs || !srs.dueDate) return true
  return srs.dueDate <= Date.now()
}
